import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { RefreshCw, ChevronDown, ChevronUp, Check, X, Star, ExternalLink } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { rarityColor } from "../lib/rarity";
import { loadFavoriteSuggestions, saveFavoriteSuggestions, suggestionKey } from "../lib/favorites";
import { getSuggestions, syncAllCollections, getSyncAllStatus } from "../lib/api";
import { useI18n } from "../lib/i18n";
import SuggestionsTooltip from "./SuggestionsTooltip";
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

export default function Suggestions() {
  const { t, currency } = useI18n();
  const [suggestions, setSuggestions] = useState([]);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [minListings, setMinListings] = useState(10);
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
  const [syncStatus, setSyncStatus] = useState(null);
  const [favorites, setFavorites] = useState(() => loadFavoriteSuggestions());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const statusPollRef = useRef(null);
  const reloadPollRef = useRef(null);

  function toggleFavorite(key) {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      saveFavoriteSuggestions(next);
      return next;
    });
  }

  useEffect(() => {
    load();
    pollSyncStatus();
    return () => {
      clearInterval(statusPollRef.current);
      clearInterval(reloadPollRef.current);
    };
  }, [currency]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getSuggestions(minListings, currency);
      setSuggestions(data.suggestions);
      setRate(data.rate);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function pollSyncStatus() {
    try {
      const status = await getSyncAllStatus();
      setSyncStatus(status);
      if (status.running) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = setInterval(async () => {
          const s = await getSyncAllStatus();
          setSyncStatus(s);
          if (!s.running) {
            clearInterval(statusPollRef.current);
            clearInterval(reloadPollRef.current);
            load();
          }
        }, 4000);

        // Isso pode rodar por horas pro catálogo inteiro — recarrega as
        // sugestões periodicamente pra elas irem aparecendo aos poucos, não
        // só quando terminar tudo.
        clearInterval(reloadPollRef.current);
        reloadPollRef.current = setInterval(load, 30000);
      }
    } catch {
      // status endpoint indisponível, ignora
    }
  }

  async function handleSyncAll() {
    try {
      const status = await syncAllCollections(false);
      setSyncStatus(status);
      pollSyncStatus();
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
          s.outcomes.some((o) => o.name.toLowerCase().includes(q))
      );
    }
    if (min != null && !isNaN(min)) rows = rows.filter((s) => s.cost >= min);
    if (max != null && !isNaN(max)) rows = rows.filter((s) => s.cost <= max);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const aFav = favorites.has(suggestionKey(a));
      const bFav = favorites.has(suggestionKey(b));
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

  const scatterData = filtered.map((s, idx) => ({
    idx,
    probLoss: s.stats.probLoss,
    roi: s.stats.roi,
    cost: s.cost,
    color: VERDICT_COLOR[s.stats.verdict] ?? COLORS.textDim,
    label: `${s.collectionName} · ${s.tier} → ${s.nextTier}${s.stattrak ? " (ST)" : ""}`,
  }));

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t("Trade-Up Suggestions")}</h1>
            <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 640 }}>
              {t(
                "Computed automatically from already-synced collections: for each collection and rarity, the cheapest available input against the possible outputs of the next rarity. Only single-collection trade-ups for now (mixing collections is elsewhere)."
              )}
            </p>
          </div>
          <button
            className="tuc-btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
            onClick={handleSyncAll}
            disabled={syncStatus?.running}
          >
            <RefreshCw size={13} className={syncStatus?.running ? "tuc-spin" : ""} />
            {syncStatus?.running ? t("Syncing collections...") : t("Sync all collections")}
          </button>
        </div>

        {syncStatus?.running && (
          <div
            style={{
              marginTop: 10,
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 11,
              color: COLORS.textDim,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {syncStatus.processed}/{syncStatus.total} {t("collections")} · {t("fetching now")}:{" "}
            {syncStatus.currentName ?? "..."}
            {syncStatus.errors.length > 0 && (
              <span style={{ color: COLORS.rust, marginLeft: 8 }}>
                {syncStatus.errors.length} {t("error(s)")}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ maxWidth: "min(1800px, 96vw)", margin: "0 auto" }}>
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
            "returns are net of the estimated Steam Market fee and only use the direct price of the predicted wear for every output. No estimated prices, no averaging across wears."
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
              onBlur={load}
            />
          </label>
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
              'No suggestions yet. Sync at least one collection on the "Collections & Prices" tab (or click "Sync all collections" above) — it needs a price at two consecutive rarities in the same collection to compute anything.'
            )}
          </div>
        ) : (
          <>
            <div
              style={{
                background: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{t("Risk × Return")}</div>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="probLoss"
                    name={t("Risk")}
                    domain={[0, 100]}
                    tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "IBM Plex Mono" }}
                    label={{ value: t("Loss risk (%)"), position: "insideBottom", offset: -12, fill: COLORS.textDim, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="roi"
                    name={t("Return")}
                    tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "IBM Plex Mono" }}
                    label={{ value: t("Expected return (%)"), angle: -90, position: "insideLeft", fill: COLORS.textDim, fontSize: 11 }}
                  />
                  <ZAxis type="number" dataKey="cost" range={[60, 350]} />
                  <ReferenceLine y={0} stroke={COLORS.textDim} strokeDasharray="4 4" />
                  <Tooltip content={<SuggestionsTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter data={scatterData}>
                    {scatterData.map((d) => (
                      <Cell key={d.idx} fill={d.color} fillOpacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>
                <span><span style={{ color: COLORS.green }}>●</span> {t("Good deal")}</span>
                <span><span style={{ color: COLORS.gold }}>●</span> {t("Risky")}</span>
                <span><span style={{ color: COLORS.rust }}>●</span> {t("Trap")}</span>
                <span style={{ marginLeft: "auto" }}>{t("bubble size = cost")}</span>
              </div>
            </div>

            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tuc-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleSort("collectionName")}>{t("Collection")}</th>
                      <th>{t("Rarity")}</th>
                      <th>ST</th>
                      <th>{t("Cheapest input")}</th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleSort("cost")}>{t("Cost")}</th>
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
                      <th>{t("Float for best output")}</th>
                      <th>{t("Possible outputs")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s, idx) => (
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
                                toggleFavorite(suggestionKey(s));
                              }}
                              aria-label={t("Favorite")}
                              style={{
                                color: favorites.has(suggestionKey(s)) ? COLORS.gold : COLORS.textDim,
                              }}
                            >
                              <Star size={15} fill={favorites.has(suggestionKey(s)) ? COLORS.gold : "none"} />
                            </button>
                          </td>
                          <td style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {expandedIdx === idx ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              {s.collectionName}
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
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <ItemThumb iconUrl={s.inputIconUrl} rarity={s.tier} size={28} />
                              <span>
                                {s.inputIsSouvenir && (
                                  <span style={{ color: COLORS.gold }}>{t("Souvenir")} </span>
                                )}
                                {s.inputSkin}
                                {s.stattrak && <span style={{ color: COLORS.gold }}> (StatTrak™)</span>}
                                {s.inputWear && (
                                  <span
                                    style={{ color: COLORS.textDim }}
                                    title={
                                      s.inputFloatRange
                                        ? t(
                                            `This skin's own float range: ${fmtFloat(s.inputFloatRange.min)}–${fmtFloat(
                                              s.inputFloatRange.max
                                            )}. "${s.inputWear}" here is raw float ${fmtFloat(
                                              s.inputWearFloatRange?.min
                                            )}–${fmtFloat(s.inputWearFloatRange?.max)} — the RELATIVE wear (what matters for the output) depends on this own range, it isn't the same across different skins.`
                                          )
                                        : undefined
                                    }
                                  >
                                    {" "}
                                    ({s.inputWear})
                                  </span>
                                )}
                                {s.inputMarketHashName && (
                                  <a
                                    href={steamMarketUrl(s.inputMarketHashName)}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: COLORS.gold, marginLeft: 6, display: "inline-flex", verticalAlign: "middle" }}
                                    title={t(
                                      "Open in market — Steam changed the site: StatTrak™/Souvenir and wear are now filters within the same page, not chosen by the link. Set them manually before buying."
                                    )}
                                  >
                                    <ExternalLink size={11} />
                                  </a>
                                )}
                              </span>
                            </div>
                          </td>
                          <td title={`${s.inputCount ?? 10} ${t("inputs")}`}>{fmtBRL(s.cost)}</td>
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
                            title={t(
                              "Hits = outputs whose net value covers the cost. Assumes constant average win and average loss per attempt (approximation)."
                            )}
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
                          <td style={{ fontSize: 11 }}>
                            {!s.floatInfo?.available ? (
                              <span style={{ color: COLORS.textDim }}>{t("no data")}</span>
                            ) : s.floatInfo.feasibleWithCheapestInput == null ? (
                              <span
                                style={{ color: COLORS.textDim }}
                                title={t(
                                  `Best output: ${s.floatInfo.bestOutcomeName} (${s.floatInfo.bestOutcomeWear}) · needs average float between ${fmtFloat(s.floatInfo.requiredAvgFloatMin)} and ${fmtFloat(s.floatInfo.requiredAvgFloatMax)}`
                                )}
                              >
                                {fmtFloat(s.floatInfo.requiredAvgFloatMin)}–{fmtFloat(s.floatInfo.requiredAvgFloatMax)}
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  color: s.floatInfo.feasibleWithCheapestInput ? COLORS.green : COLORS.rust,
                                }}
                                title={t(
                                  `Best output: ${s.floatInfo.bestOutcomeName} (${s.floatInfo.bestOutcomeWear}, ${fmtBRL(
                                    s.floatInfo.bestOutcomePrice
                                  )}) needs average float between ${fmtFloat(s.floatInfo.requiredAvgFloatMin)}–${fmtFloat(
                                    s.floatInfo.requiredAvgFloatMax
                                  )}. Buying the cheapest input (${s.floatInfo.inputWear}), your float lands between ${fmtFloat(
                                    s.floatInfo.inputAchievableFloatMin
                                  )}–${fmtFloat(s.floatInfo.inputAchievableFloatMax)}.`
                                )}
                              >
                                {s.floatInfo.feasibleWithCheapestInput ? <Check size={12} /> : <X size={12} />}
                                {fmtFloat(s.floatInfo.requiredAvgFloatMin)}–{fmtFloat(s.floatInfo.requiredAvgFloatMax)}
                              </span>
                            )}
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
                            <td colSpan={15} style={{ background: COLORS.panelAlt }}>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                {t("Best case")}: {fmtBRL(s.stats.bestCaseProfit)} ({s.stats.bestCaseRoi >= 0 ? "+" : ""}
                                {s.stats.bestCaseRoi.toFixed(1)}%) · {t("Worst case")}: {fmtBRL(s.stats.worstCaseProfit)} (
                                {s.stats.worstCaseRoi >= 0 ? "+" : ""}
                                {s.stats.worstCaseRoi.toFixed(1)}%)
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                {t("Net expected value")}: {fmtBRL(s.stats.ev)} · {t("Net expected profit")}:{" "}
                                {fmtBRL(s.stats.evProfit)} · {t("gross value before fee")}: {fmtBRL(s.stats.grossEv)} · {s.outcomeCount} {t("possible outputs")} (1/
                                {s.outcomeCount} {t("odds each")})
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.gold, marginBottom: 6 }}>
                                {t(
                                  "Return already deducts the estimated Steam Market fee (15% estimate; final rounding may vary a few cents). Only outputs whose predicted wear has a direct price and enough liquidity are included."
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: COLORS.text,
                                  marginBottom: 8,
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
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                {s.assumedAvgFloat != null ? (
                                  t(
                                    `The price of each output already accounts for the real predicted wear — assuming you buy the input at ${s.inputWear} (relative float ~${fmtFloat(s.assumedAvgFloat)}, i.e. ${fmtFloat(s.assumedAvgFloat * 100)}% of the way between the newest and most worn version this specific input reaches — not its raw float, and it may land on a different wear on the output if the output skin has a different float range than the input). Not an average across wears.`
                                  )
                                ) : (
                                  t(
                                    "No float data for this input — the output prices here are an average across the possible wears (approximation)."
                                  )
                                )}
                              </div>
                              {s.floatInfo?.available && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    padding: "8px 10px",
                                    marginBottom: 8,
                                    borderRadius: 6,
                                    border: `1px solid ${
                                      s.floatInfo.feasibleWithCheapestInput === false ? COLORS.rust : COLORS.border
                                    }`,
                                    color: COLORS.text,
                                  }}
                                >
                                  {t("Best reachable output")}:{" "}
                                  <strong>
                                    {s.floatInfo.bestOutcomeName} ({s.floatInfo.bestOutcomeWear})
                                  </strong>{" "}
                                  {t("for")} {fmtBRL(s.floatInfo.bestOutcomePrice)} — {t("needs average input float between")}{" "}
                                  <strong>
                                    {fmtFloat(s.floatInfo.requiredAvgFloatMin)} {t("and")}{" "}
                                    {fmtFloat(s.floatInfo.requiredAvgFloatMax)}
                                  </strong>
                                  .{" "}
                                  {s.floatInfo.feasibleWithCheapestInput === false ? (
                                    <span style={{ color: COLORS.rust }}>
                                      {t(
                                        `Buying the cheapest input (${s.floatInfo.inputWear}), the average float lands between ${fmtFloat(s.floatInfo.inputAchievableFloatMin)} and ${fmtFloat(s.floatInfo.inputAchievableFloatMax)} — outside that range, meaning this specific output can't come out with this input. To aim for it, you need an input with a lower (more expensive) float.`
                                      )}
                                    </span>
                                  ) : s.floatInfo.feasibleWithCheapestInput === true ? (
                                    <span style={{ color: COLORS.green }}>
                                      {t(
                                        `The cheapest input (${s.floatInfo.inputWear}) already falls in this range — you can aim for this output without paying more for the input.`
                                      )}
                                    </span>
                                  ) : null}
                                </div>
                              )}
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
                                  defaultOutcomeName={s.floatInfo?.bestOutcomeName}
                                  legs={[
                                    {
                                      count: s.inputCount ?? 10,
                                      floatRange: s.inputFloatRange,
                                      wearRange: s.inputWearFloatRange,
                                      label: null,
                                    },
                                  ]}
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
                    ))}
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
          </>
        )}
      </div>
    </div>
  );
}
