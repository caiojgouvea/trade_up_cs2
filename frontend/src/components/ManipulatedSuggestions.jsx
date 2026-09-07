import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Star, Shuffle, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { rarityColor } from "../lib/rarity";
import { loadFavoriteManipulated, saveFavoriteManipulated, manipulatedKey } from "../lib/favorites";
import { useI18n } from "../lib/i18n";
import {
  getManipulatedRefreshStatus,
  getManipulatedSuggestions,
  refreshManipulatedSuggestions,
} from "../lib/api";
import ItemThumb from "./ItemThumb";
import FloatCalculator from "./FloatCalculator";
import Pagination from "./Pagination";

function steamMarketUrl(marketHashName) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
}

function wearLabel(o, t) {
  if (!o.predictedWear) return t("average across wears");
  const withFloat = o.predictedFloatValue != null ? ` · float ${fmtFloat(o.predictedFloatValue)}` : "";
  return (o.priceIsEstimate ? `${o.predictedWear}, ${t("estimated price")}` : o.predictedWear) + withFloat;
}

function breakEvenLabel(stats, t) {
  if (stats.breakEvenHits10 == null) return t("never");
  if (stats.breakEvenHits10 === 0) return t("risk-free");
  return `≥${stats.breakEvenHits10}/10`;
}

const VERDICT_COLOR = {
  "Good deal": COLORS.green,
  Risky: COLORS.gold,
  Trap: COLORS.rust,
};

export default function ManipulatedSuggestions() {
  const { t, currency } = useI18n();
  const [suggestions, setSuggestions] = useState([]);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [minListings, setMinListings] = useState(10);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [stattrakFilter, setStattrakFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [textFilter, setTextFilter] = useState("");
  const [minCost, setMinCost] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [minRisk, setMinRisk] = useState("");
  const [maxRisk, setMaxRisk] = useState("");
  const [sort, setSort] = useState({ key: "stats.roi", dir: "desc" });
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [calcOpenIdx, setCalcOpenIdx] = useState(null);
  const [favorites, setFavorites] = useState(() => loadFavoriteManipulated());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  function toggleFavorite(key) {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      saveFavoriteManipulated(next);
      return next;
    });
  }

  useEffect(() => {
    load();
    getManipulatedRefreshStatus().then(setJobStatus).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  useEffect(() => {
    if (!jobStatus?.running) return undefined;

    const timer = setInterval(async () => {
      try {
        const next = await getManipulatedRefreshStatus();
        setJobStatus(next);
        if (!next.running) {
          if (next.error) {
            setError(`Recalculation failed: ${next.error}`);
          } else {
            setMinListings(next.minListings);
            load(next.minListings);
          }
        }
      } catch (e) {
        setError(e.message);
      }
    }, 2000);

    return () => clearInterval(timer);
    // `load` é estável para o ciclo de vida deste componente; só a execução
    // concluída do job deve disparar uma nova leitura do cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus?.running]);

  async function load(targetMinListings = minListings) {
    setLoading(true);
    setError("");
    try {
      const data = await getManipulatedSuggestions(targetMinListings, currency);
      setSuggestions(data.suggestions);
      setRate(data.rate);
      setCacheInfo({
        computedAt: data.computedAt ?? null,
        minListings: data.minListings ?? targetMinListings,
        exhaustive: Boolean(data.exhaustive),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh(exhaustive) {
    setError("");
    try {
      const status = await refreshManipulatedSuggestions(minListings, exhaustive, currency);
      setJobStatus(status);
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleSort(key) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  }

  function getSortValue(s, key) {
    if (key.startsWith("stats.")) return s.stats[key.slice(6)];
    return s[key];
  }

  const filtered = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    const min = minCost.trim() === "" ? null : Number(minCost.replace(",", "."));
    const max = maxCost.trim() === "" ? null : Number(maxCost.replace(",", "."));
    const riskMin = minRisk.trim() === "" ? null : Number(minRisk.replace(",", "."));
    const riskMax = maxRisk.trim() === "" ? null : Number(maxRisk.replace(",", "."));
    let rows = suggestions;
    if (stattrakFilter !== "all") {
      const want = stattrakFilter === "stattrak";
      rows = rows.filter((s) => s.stattrak === want);
    }
    if (rarityFilter !== "all") {
      rows = rows.filter((s) => s.nextTier === rarityFilter);
    }
    if (riskFilter === "high") rows = rows.filter((s) => s.stats.probLoss >= 45);
    if (riskFilter === "fifty") {
      rows = rows.filter(
        (s) => s.outcomes.length === 2 && s.outcomes.every((o) => Math.abs(Number(o.prob) - 50) < 0.01)
      );
    }
    if (riskMin != null && !isNaN(riskMin)) rows = rows.filter((s) => s.stats.probLoss >= riskMin);
    if (riskMax != null && !isNaN(riskMax)) rows = rows.filter((s) => s.stats.probLoss <= riskMax);
    if (q) {
      rows = rows.filter(
        (s) =>
          s.collectionName.toLowerCase().includes(q) ||
          s.legs.some((l) => l.skinName.toLowerCase().includes(q)) ||
          s.outcomes.some((o) => o.name.toLowerCase().includes(q))
      );
    }
    if (min != null && !isNaN(min)) rows = rows.filter((s) => s.cost >= min);
    if (max != null && !isNaN(max)) rows = rows.filter((s) => s.cost <= max);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const aFav = favorites.has(manipulatedKey(a));
      const bFav = favorites.has(manipulatedKey(b));
      if (aFav !== bFav) return aFav ? -1 : 1;

      const av = getSortValue(a, sort.key);
      const bv = getSortValue(b, sort.key);
      if (typeof av === "string") return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
  }, [suggestions, stattrakFilter, rarityFilter, riskFilter, textFilter, minCost, maxCost, minRisk, maxRisk, sort, favorites]);

  // Volta pra página 1 quando filtro/ordenação/dataset muda, sem useEffect —
  // ajusta durante o render em vez de disparar outro ciclo de commit.
  const filterSignature = `${stattrakFilter}|${rarityFilter}|${riskFilter}|${textFilter}|${minCost}|${maxCost}|${minRisk}|${maxRisk}|${sort.key}|${sort.dir}`;
  const prevFilterSignatureRef = useRef(filterSignature);
  const prevSuggestionsRef = useRef(suggestions);
  if (prevFilterSignatureRef.current !== filterSignature || prevSuggestionsRef.current !== suggestions) {
    prevFilterSignatureRef.current = filterSignature;
    prevSuggestionsRef.current = suggestions;
    if (page !== 1) setPage(1);
    if (expandedIdx !== null) setExpandedIdx(null);
    if (calcOpenIdx !== null) setCalcOpenIdx(null);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function changePage(next) {
    setPage(Math.min(Math.max(1, next), pageCount));
    setExpandedIdx(null);
    setCalcOpenIdx(null);
  }

  const rarityOptions = useMemo(() => {
    const order = ["Industrial Grade", "Mil-Spec Grade", "Restricted", "Classified", "Covert"];
    const present = new Set(suggestions.map((s) => s.nextTier));
    return order.filter((r) => present.has(r));
  }, [suggestions]);

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100%",
        color: COLORS.text,
        fontFamily: "'Space Grotesk', sans-serif",
        padding: "28px 20px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "min(1800px, 96vw)", margin: "0 auto 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shuffle size={18} color={COLORS.gold} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t("Manipulated Trade-Ups")}</h1>
        </div>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 720 }}>
          {t(
            "Instead of buying 10 copies of the cheapest input, mixes two different units (different wears and/or skins, same rarity and collection) to steer the average input float into a cheaper-to-reach range. The output float is deterministic, so this changes on purpose which wear each possible output will have. Only shows up here when the mix beats the uniform strategy — most collections gain nothing from mixing."
          )}
          <strong style={{ color: COLORS.text }}> {t("Warning:")} </strong>
          {t(
            "the float used is the worst edge of each wear's range (Steam doesn't expose the exact float of a listing before buying), so the result is an estimate, not a guarantee — the real wear of a specific listing can vary within the range."
          )}
        </p>
      </div>

      <div style={{ maxWidth: "min(1800px, 96vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            background: COLORS.panel,
            border: `1px solid ${COLORS.gold}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 12,
          }}
        >
          <AlertTriangle size={16} color={COLORS.gold} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ color: COLORS.gold }}>{t("Careful when buying:")}</strong>{" "}
            {t(
              'the mix only works if you buy exactly the wear (and StatTrak™, when marked) shown for each leg — getting it wrong destroys the calculated float. The "open in market" link takes you to the right weapon+skin page, but Steam changed the site:'
            )}{" "}
            <strong>{t("StatTrak™ and each wear are now filters within the same page")}</strong>,{" "}
            {t(
              'not separate pages — the link does NOT select this by itself. After opening, manually check the StatTrak™ filter (if the leg calls for it) and the exact wear before buying. This caught a user off guard once: they clicked a StatTrak leg\'s link and ended up buying the Normal version by mistake, because the page opens with Normal selected by default.'
            )}
          </div>
        </div>
        {error && (
          <div
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.rust}`,
              color: COLORS.rust,
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            background: COLORS.panel,
            border: `1px solid ${COLORS.green}`,
            borderRadius: 8,
            padding: "9px 12px",
            color: COLORS.textDim,
            fontSize: 11,
            marginBottom: 14,
          }}
        >
          <strong style={{ color: COLORS.green }}>{t("Conservative mode:")}</strong>{" "}
          {t(
            "returns are net of the estimated Steam Market fee and only use the direct price of the predicted wear for every output."
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 16,
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <label style={{ fontSize: 11, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 6 }}>
            {t("Min. liquidity (active listings)")}
            <input
              className="tuc-input"
              style={{ width: 70 }}
              type="number"
              min={0}
              value={minListings}
              onChange={(e) => setMinListings(Number(e.target.value))}
              onBlur={() => load()}
            />
          </label>
          <button
            className="tuc-btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
            onClick={() => handleRefresh(false)}
            disabled={jobStatus?.running}
            title={t("Recalculates with the optimized pool. The previous result stays available until it finishes.")}
          >
            <RefreshCw size={13} className={jobStatus?.running ? "tuc-spin" : ""} />
            {jobStatus?.running ? t("Recalculating...") : t("Recalculate")}
          </button>
          <button
            className="tuc-btn-ghost"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => handleRefresh(true)}
            disabled={jobStatus?.running}
            title={t("Tests every wildcard item. Can take hours and keeps running on the server.")}
          >
            {t("Exhaustive search")}
          </button>
          <select
            className="tuc-input"
            style={{ width: 140 }}
            value={stattrakFilter}
            onChange={(e) => setStattrakFilter(e.target.value)}
          >
            <option value="all">{t("Normal + StatTrak")}</option>
            <option value="normal">{t("Normal only")}</option>
            <option value="stattrak">{t("StatTrak only")}</option>
          </select>
          <select
            className="tuc-input"
            style={{ width: 160 }}
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
          >
            <option value="all">{t("Any output rarity")}</option>
            {rarityOptions.map((r) => (
              <option key={r} value={r}>
                {t("Output")}: {r}
              </option>
            ))}
          </select>
          <select
            className="tuc-input"
            style={{ width: 155 }}
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="all">{t("Any risk")}</option>
            <option value="high">{t("High risk (45%+)")}</option>
            <option value="fifty">{t("Exact 50/50")}</option>
          </select>
          <input
            className="tuc-input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder={t("Filter by collection or skin...")}
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
          <label style={{ fontSize: 11, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 6 }}>
            {t("Cost")}
            <input
              className="tuc-input"
              style={{ width: 80 }}
              placeholder={t("min.")}
              value={minCost}
              onChange={(e) => setMinCost(e.target.value)}
            />
            <span>–</span>
            <input
              className="tuc-input"
              style={{ width: 80 }}
              placeholder={t("max.")}
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 11, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 6 }}>
            {t("Risk %")}
            <input
              className="tuc-input"
              style={{ width: 60 }}
              placeholder={t("min.")}
              value={minRisk}
              onChange={(e) => setMinRisk(e.target.value)}
            />
            <span>–</span>
            <input
              className="tuc-input"
              style={{ width: 60 }}
              placeholder={t("max.")}
              value={maxRisk}
              onChange={(e) => setMaxRisk(e.target.value)}
            />
          </label>
          {rate != null && currency === "brl" && (
            <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: "auto" }}>
              1 USD ≈ {fmtBRL(rate)}
            </span>
          )}
        </div>

        {(jobStatus?.running || cacheInfo?.computedAt) && (
          <div
            style={{
              marginTop: -8,
              marginBottom: 16,
              color: COLORS.textDim,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {jobStatus?.running
              ? `${t("Calculating")} ${jobStatus.exhaustive ? t("in exhaustive mode") : t("in optimized mode")} ${t("with minimum liquidity")} ${jobStatus.minListings}... ${t("The page stays usable.")}`
              : `${t("Cached result:")} ${new Date(cacheInfo.computedAt).toLocaleString()} · ${t("minimum liquidity")} ${cacheInfo.minListings}${cacheInfo.exhaustive ? ` · ${t("exhaustive search")}` : ""}.`}
          </div>
        )}

        {loading ? (
          <div style={{ color: COLORS.textDim, fontSize: 13 }}>{t("Calculating...")}</div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: 30,
              textAlign: "center",
              color: COLORS.textDim,
              fontSize: 13,
            }}
          >
            {t(
              "No mix is worth it with the data synced right now — most collections gain nothing from manipulating the float, the uniform cheapest input is already optimal."
            )}
          </div>
        ) : (
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="tuc-table">
                <thead>
                  <tr>
                    <th></th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("collectionName")}>{t("Collection")}</th>
                    <th>{t("Rarity")}</th>
                    <th>ST</th>
                    <th>{t("Input mix")}</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("cost")}>{t("Cost (10x)")}</th>
                    <th>{t("Uniform cost")}</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.bestCaseRoi")} title={t("Net profit if the most expensive possible output comes out")}>{t("Best case")}</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.roi")} title={t("Average weighted by the odds of each output")}>{t("Expected")}</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.worstCaseRoi")} title={t("Net profit if the cheapest possible output comes out")}>{t("Worst case")}</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.probLoss")}>{t("Risk")}</th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleSort("stats.breakEvenHits10")}
                      title={t("Running this contract 10x, how many hits (an output that covers the cost) you need to not end up at a loss")}
                    >
                      {t("Break-even in 10x")}
                    </th>
                    <th>{t("Verdict")}</th>
                    <th>{t("Possible outputs")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s, idx) => {
                    const key = manipulatedKey(s);
                    return (
                      <Fragment key={idx}>
                        <tr
                          style={{ cursor: "pointer" }}
                          onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                        >
                          <td>
                            <button
                              className="tuc-icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(key);
                              }}
                              aria-label={t("Favorite")}
                              style={{ color: favorites.has(key) ? COLORS.gold : COLORS.textDim }}
                            >
                              <Star size={15} fill={favorites.has(key) ? COLORS.gold : "none"} />
                            </button>
                          </td>
                          <td style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {expandedIdx === idx ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              {s.collectionName}
                              {s.crossCollection && (
                                <span
                                  title={t("Uses a wildcard from another collection to adjust the float — part of the output odds come from that other collection")}
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 600,
                                    color: COLORS.rust,
                                    border: `1px solid ${COLORS.rust}`,
                                    borderRadius: 4,
                                    padding: "1px 5px",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {t("Cross-collection")}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ fontSize: 11 }}>
                            <span style={{ color: rarityColor(s.tier, COLORS.textDim) }}>{s.tier}</span>
                            <span style={{ color: COLORS.textDim }}> → </span>
                            <span style={{ color: rarityColor(s.nextTier, COLORS.textDim) }}>{s.nextTier}</span>
                          </td>
                          <td style={{ color: s.stattrak ? COLORS.gold : COLORS.textDim, fontSize: 11 }}>
                            {s.stattrak ? "ST" : "—"}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {s.legs.map((l, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <ItemThumb iconUrl={l.iconUrl} rarity={s.tier} size={22} />
                                  <span>
                                    {l.count}x {l.isSouvenir && <span style={{ color: COLORS.gold }}>{t("Souvenir")} </span>}
                                    {l.skinName}{" "}
                                    <span
                                      style={{ color: COLORS.textDim }}
                                      title={
                                        l.floatRange
                                          ? t(
                                              `This skin's own float range: ${fmtFloat(l.floatRange.min)}–${fmtFloat(
                                                l.floatRange.max
                                              )}. Its RELATIVE wear (what enters the calculation) depends on this range, it isn't the same across different skins.`
                                            )
                                          : undefined
                                      }
                                    >
                                      ({l.wear})
                                    </span>
                                    {l.collectionTag !== s.collectionTag && (
                                      <span style={{ color: COLORS.rust }}> — {t("wildcard")} ({l.collectionName})</span>
                                    )}
                                  </span>
                                  <a
                                    href={steamMarketUrl(l.marketHashName)}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: COLORS.gold, display: "flex", alignItems: "center" }}
                                    title={t("Open in market — set the StatTrak™ filter and right wear on the page, the link doesn't select it by itself")}
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td>{fmtBRL(s.cost)}</td>
                          <td style={{ fontSize: 11, color: COLORS.textDim }}>
                            {fmtBRL(s.baselineCost)}
                            {s.baselineRoi != null && (
                              <div>
                                ({s.baselineRoi >= 0 ? "+" : ""}
                                {s.baselineRoi.toFixed(1)}%)
                              </div>
                            )}
                          </td>
                          <td style={{ color: s.stats.bestCaseProfit >= 0 ? COLORS.green : COLORS.rust }}>
                            {s.stats.bestCaseRoi >= 0 ? "+" : ""}
                            {s.stats.bestCaseRoi.toFixed(1)}%
                          </td>
                          <td style={{ color: s.stats.evProfit >= 0 ? COLORS.green : COLORS.rust }}>
                            {s.stats.roi >= 0 ? "+" : ""}
                            {s.stats.roi.toFixed(1)}%
                          </td>
                          <td style={{ color: s.stats.worstCaseProfit >= 0 ? COLORS.green : COLORS.rust }}>
                            {s.stats.worstCaseRoi >= 0 ? "+" : ""}
                            {s.stats.worstCaseRoi.toFixed(1)}%
                          </td>
                          <td>{s.stats.probLoss.toFixed(0)}%</td>
                          <td
                            style={{ color: s.stats.breakEvenHits10 == null ? COLORS.rust : COLORS.textDim, fontSize: 11 }}
                            title={t("Hits = outputs whose net value covers the cost. Assumes constant average win and average loss per attempt (approximation).")}
                          >
                            {breakEvenLabel(s.stats, t)}
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                color: VERDICT_COLOR[s.stats.verdict],
                                border: `1px solid ${VERDICT_COLOR[s.stats.verdict]}`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                fontSize: 11,
                                lineHeight: 1.3,
                                textAlign: "center",
                              }}
                            >
                              {t(s.stats.verdict)}
                            </span>
                          </td>
                          <td style={{ maxWidth: 220 }}>
                            <div
                              style={{ display: "flex", flexDirection: "column", gap: 3 }}
                              title={s.outcomes
                                .map((o) => `${o.name} (${wearLabel(o, t)}) · ${fmtBRL(o.price)} · ${o.minListings} ${t("listings")}`)
                                .join(" | ")}
                            >
                              {s.outcomes.slice(0, 3).map((o, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <ItemThumb iconUrl={o.iconUrl} rarity={s.nextTier} size={20} />
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: COLORS.textDim,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {o.name}
                                    {o.predictedWear && (
                                      <span style={{ color: o.priceIsEstimate ? COLORS.gold : "inherit", opacity: o.priceIsEstimate ? 1 : 0.7 }}>
                                        {" "}
                                        ({o.predictedWear}
                                        {o.priceIsEstimate ? "≈" : ""})
                                      </span>
                                    )}
                                    {o.fromCollectionTag !== s.collectionTag && (
                                      <span style={{ color: COLORS.rust }}> · {t("other collection")}</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                              {s.outcomes.length > 3 && (
                                <span style={{ fontSize: 10, color: COLORS.textDim, paddingLeft: 26 }}>
                                  +{s.outcomes.length - 3} {t("more")}
                                </span>
                              )}
                            </div>
                          </td>
                          <td></td>
                        </tr>
                        {expandedIdx === idx && (
                          <tr>
                            <td colSpan={14} style={{ background: COLORS.panelAlt }}>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                {t("Best case")}: {fmtBRL(s.stats.bestCaseProfit)} ({s.stats.bestCaseRoi >= 0 ? "+" : ""}
                                {s.stats.bestCaseRoi.toFixed(1)}%) · {t("Worst case")}: {fmtBRL(s.stats.worstCaseProfit)} (
                                {s.stats.worstCaseRoi >= 0 ? "+" : ""}
                                {s.stats.worstCaseRoi.toFixed(1)}%)
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                {t("Net expected value")}: {fmtBRL(s.stats.ev)} · {t("Net expected profit")}:{" "}
                                {fmtBRL(s.stats.evProfit)} · {s.outcomeCount} {t("possible outputs")}
                                {!s.crossCollection && <> (1/{s.outcomeCount} {t("odds each")})</>}
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.gold, marginBottom: 10 }}>
                                {t("Return already deducts the estimated Steam Market fee (15% estimate). Only outputs with a direct price for the predicted wear are included.")}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: COLORS.text,
                                  marginBottom: 10,
                                  padding: "8px 10px",
                                  borderRadius: 6,
                                  border: `1px solid ${COLORS.border}`,
                                }}
                              >
                                <strong>{t("Running this contract 10x")}</strong> ({t("total cost")} {fmtBRL(s.cost * 10)}):{" "}
                                {t("average win")} {fmtBRL(s.stats.avgWinProfit)} {t("per hit")}, {t("average loss")}{" "}
                                {fmtBRL(s.stats.avgLossProfit)} {t("per miss")}.{" "}
                                {s.stats.breakEvenHits10 == null ? (
                                  <span style={{ color: COLORS.rust }}>
                                    {t("No output covers the cost — no number of hits makes this worth it.")}
                                  </span>
                                ) : s.stats.breakEvenHits10 === 0 ? (
                                  <span style={{ color: COLORS.green }}>{t("No output results in a loss — no risk of losing across all 10x.")}</span>
                                ) : (
                                  <span style={{ color: COLORS.green }}>
                                    {t("Hitting at least")} <strong>{s.stats.breakEvenHits10} {t("of 10")}</strong> {t("attempts already gets you to break-even or profit")} ({t("expected profit")} ×10: {fmtBRL(s.stats.evProfit * 10)}).
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 10 }}>
                                {t("Mix")}: {s.legs.map((l) => `${l.count}x ${l.isSouvenir ? t("Souvenir") + " " : ""}${l.skinName} (${l.wear})`).join(" + ")}{" "}
                                → {t("average relative float")} ~{fmtFloat(s.assumedAvgFloat)}{" "}
                                {t(
                                  "(a position between 0–1 within each input skin's own range, not the raw float — and it can land on a wear quite different from how it 'looks' on the output, if the output skin has a different float range than the input; based on the worst edge of each chosen wear, not the exact float of a specific listing)."
                                )}{" "}
                                {t("Cost of")}{" "}
                                {fmtBRL(s.cost)} {t("vs")} {fmtBRL(s.baselineCost)} {t("for the uniform strategy (10x the cheapest input)")}
                                {s.baselineRoi != null && (
                                  <>
                                    {" — "}
                                    {t("which yields")} {s.baselineRoi >= 0 ? "+" : ""}
                                    {s.baselineRoi.toFixed(1)}% {t("alone, vs")} {s.stats.roi >= 0 ? "+" : ""}
                                    {s.stats.roi.toFixed(1)}% {t("mixing")}
                                  </>
                                )}
                                .
                              </div>
                              {s.crossCollection && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: COLORS.text,
                                    marginBottom: 10,
                                    padding: "8px 10px",
                                    borderRadius: 6,
                                    border: `1px solid ${COLORS.rust}`,
                                  }}
                                >
                                  <strong style={{ color: COLORS.rust }}>{t("Cross-collection:")}</strong>{" "}
                                  {[...new Set(
                                    s.legs.filter((l) => l.collectionTag !== s.collectionTag).map((l) => l.collectionName)
                                  )].length > 1 ? (
                                    <>
                                      {t("legs come from")} <strong>{[...new Set(
                                        s.legs.filter((l) => l.collectionTag !== s.collectionTag).map((l) => l.collectionName)
                                      )].join(` ${t("and")} `)}</strong>
                                    </>
                                  ) : (
                                    <>
                                      {t("one of the legs is from")}{" "}
                                      <strong>{s.legs.find((l) => l.collectionTag !== s.collectionTag)?.collectionName}</strong>
                                    </>
                                  )}
                                  , {t("not (only) from")} {s.collectionName}.{" "}
                                  {t(
                                    "The game rolls the output proportionally to how many of the 10 items came from each collection — so a real part of the odds (marked \"other collection\" below) come from there. This is expected, not a bug: it's the trade-off that makes the float cheaper to reach — the more collections mixed, the higher the risk, but sometimes the return too."
                                  )}
                                </div>
                              )}
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                  marginBottom: 10,
                                  padding: "8px 10px",
                                  borderRadius: 6,
                                  border: `1px solid ${COLORS.border}`,
                                }}
                              >
                                <span style={{ fontSize: 10, color: COLORS.textDim, textTransform: "uppercase" }}>
                                  {t(
                                    "Buy exactly this (the link opens the weapon+skin page — set StatTrak™ and wear on the page before buying, the link doesn't pick it by itself):"
                                  )}
                                </span>
                                {s.legs.map((l, i) => (
                                  <a
                                    key={i}
                                    href={steamMarketUrl(l.marketHashName)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      fontSize: 12,
                                      color: COLORS.gold,
                                      textDecoration: "none",
                                    }}
                                  >
                                    <ItemThumb iconUrl={l.iconUrl} rarity={s.tier} size={22} />
                                    {l.count}x {l.isSouvenir && `${t("Souvenir")} `}
                                    {l.skinName} ({l.wear}) — {fmtBRL(l.unitPriceBrl)} {t("each")}
                                    <ExternalLink size={12} />
                                  </a>
                                ))}
                              </div>
                              <button
                                className="tuc-btn-ghost"
                                style={{ fontSize: 10, padding: "4px 8px", marginBottom: 8 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCalcOpenIdx(calcOpenIdx === idx ? null : idx);
                                }}
                              >
                                {calcOpenIdx === idx ? t("Close float calculator") : t("Float calculator")}
                              </button>
                              {calcOpenIdx === idx && (
                                <FloatCalculator
                                  outcomes={s.outcomes}
                                  legs={s.legs.map((l) => ({
                                    count: l.count,
                                    floatRange: l.floatRange,
                                    wearRange: l.wearFloatRange,
                                    label: `${l.count}x ${l.isSouvenir ? t("Souvenir") + " " : ""}${l.skinName} (${l.wear})`,
                                  }))}
                                />
                              )}
                              {s.outcomes.map((o, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    fontSize: 12,
                                    padding: "4px 0",
                                    gap: 10,
                                    borderBottom: i < s.outcomes.length - 1 ? `1px solid ${COLORS.border}` : "none",
                                  }}
                                >
                                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <ItemThumb iconUrl={o.iconUrl} rarity={s.nextTier} size={26} />
                                    {o.name}
                                    <span style={{ color: o.priceIsEstimate ? COLORS.gold : COLORS.textDim }}>
                                      ({wearLabel(o, t)})
                                    </span>
                                    {o.fromCollectionTag !== s.collectionTag && (
                                      <span style={{ color: COLORS.rust, fontSize: 10 }}>
                                        {t("other collection")} ({s.legs.find((l) => l.collectionTag === o.fromCollectionTag)?.collectionName})
                                      </span>
                                    )}
                                    {o.marketHashName && (
                                      <a
                                        href={steamMarketUrl(o.marketHashName)}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ color: COLORS.gold, display: "flex", alignItems: "center" }}
                                        title={t(
                                          "Open the output in the market — check the real price and liquidity before deciding. Steam requires you to select StatTrak™ and the right wear on the page itself."
                                        )}
                                      >
                                        <ExternalLink size={11} />
                                      </a>
                                    )}
                                  </span>
                                  <span style={{ color: COLORS.textDim, whiteSpace: "nowrap" }}>
                                    {o.prob.toFixed(1)}% · {t("market")} {fmtBRL(o.price)} → {t("net")} {fmtBRL(o.netPrice)} · {o.minListings} {t("listings")}
                                  </span>
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              total={filtered.length}
              pageSize={pageSize}
              onPageChange={changePage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
