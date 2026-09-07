import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, History } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { rarityColor } from "../lib/rarity";
import { getSuggestionHistory } from "../lib/api";
import { useI18n } from "../lib/i18n";
import ItemThumb from "./ItemThumb";
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

export default function SuggestionHistory() {
  const { t } = useI18n();
  const SORT_OPTIONS = [
    { value: "bestCaseRoi", label: t("Best case") },
    { value: "roi", label: t("Expected") },
    { value: "worstCaseRoi", label: t("Worst case") },
    { value: "computedAt", label: t("Most recent") },
  ];
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("bestCaseRoi");
  const [minRoi, setMinRoi] = useState("");
  const [minBestCaseRoi, setMinBestCaseRoi] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, page, pageSize]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getSuggestionHistory({
        sort,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        minRoi: minRoi.trim() === "" ? undefined : Number(minRoi.replace(",", ".")),
        minBestCaseRoi: minBestCaseRoi.trim() === "" ? undefined : Number(minBestCaseRoi.replace(",", ".")),
      });
      setRows(data.rows);
      setTotal(data.total);
      setStats(data.stats);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyThresholds() {
    setPage(1);
    load();
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

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
          <History size={18} color={COLORS.gold} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t("Findings history")}</h1>
        </div>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 720 }}>
          {t(
            'Every "manipulated" contract (mixing inputs and/or collections) that has ever shown up in a recalculation run — manual or "exhaustive search" — stays logged here forever, even if the price changes later and it disappears from the current list. Trigger runs on the "Manipulated" tab to feed this history.'
          )}
        </p>
        {stats && (
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
            {stats.entries} {t("findings logged across")} {stats.runs} {t("run(s)")}
            {stats.firstAt && (
              <>
                {" "}
                · {t("first at")} {new Date(stats.firstAt).toLocaleString()} · {t("last at")}{" "}
                {new Date(stats.lastAt).toLocaleString()}
              </>
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
            {t("Sort by")}
            <select
              className="tuc-input"
              style={{ width: 150 }}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 11, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 6 }}>
            {t("Min. expected %")}
            <input
              className="tuc-input"
              style={{ width: 70 }}
              value={minRoi}
              onChange={(e) => setMinRoi(e.target.value)}
              onBlur={applyThresholds}
              onKeyDown={(e) => e.key === "Enter" && applyThresholds()}
            />
          </label>
          <label style={{ fontSize: 11, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 6 }}>
            {t("Min. best case %")}
            <input
              className="tuc-input"
              style={{ width: 70 }}
              value={minBestCaseRoi}
              onChange={(e) => setMinBestCaseRoi(e.target.value)}
              onBlur={applyThresholds}
              onKeyDown={(e) => e.key === "Enter" && applyThresholds()}
            />
          </label>
        </div>

        {loading ? (
          <div style={{ color: COLORS.textDim, fontSize: 13 }}>{t("Loading...")}</div>
        ) : rows.length === 0 ? (
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
              'Nothing logged yet. Go to the "Manipulated" tab and click "Recalculate" or "Exhaustive search" at least once — each run feeds this history.'
            )}
          </div>
        ) : (
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="tuc-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>{t("Collection")}</th>
                    <th>{t("Rarity")}</th>
                    <th>ST</th>
                    <th>{t("Legs")}</th>
                    <th>{t("Cost")}</th>
                    <th>{t("Best case")}</th>
                    <th>{t("Expected")}</th>
                    <th>{t("Worst case")}</th>
                    <th>{t("Risk")}</th>
                    <th title={t("Running this contract 10x, how many hits you need to not end up at a loss")}>{t("Break-even in 10x")}</th>
                    <th>{t("Found at")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <Fragment key={s.id}>
                      <tr style={{ cursor: "pointer" }} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                        <td>{expandedId === s.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</td>
                        <td style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
                          {s.collectionName}
                          {s.crossCollection && (
                            <span
                              title={t("Mixes more than one collection")}
                              style={{
                                fontSize: 9,
                                fontWeight: 600,
                                color: COLORS.rust,
                                border: `1px solid ${COLORS.rust}`,
                                borderRadius: 4,
                                padding: "1px 5px",
                                marginLeft: 6,
                                textTransform: "uppercase",
                              }}
                            >
                              {t("Cross-collection")}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 11 }}>
                          <span style={{ color: rarityColor(s.tier, COLORS.textDim) }}>{s.tier}</span>
                          <span style={{ color: COLORS.textDim }}> → </span>
                          <span style={{ color: rarityColor(s.nextTier, COLORS.textDim) }}>{s.nextTier}</span>
                        </td>
                        <td style={{ color: s.stattrak ? COLORS.gold : COLORS.textDim, fontSize: 11 }}>
                          {s.stattrak ? "ST" : "—"}
                        </td>
                        <td style={{ fontSize: 11, color: COLORS.textDim }}>{s.legs?.length ?? "—"}</td>
                        <td>{fmtBRL(s.cost)}</td>
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
                        <td style={{ fontSize: 11, color: COLORS.textDim, whiteSpace: "nowrap" }}>
                          {new Date(s.computedAt).toLocaleString()}
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <tr>
                          <td colSpan={12} style={{ background: COLORS.panelAlt }}>
                            <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 10 }}>
                              {t("Mix")}: {s.legs?.map((l) => `${l.count}x ${l.isSouvenir ? t("Souvenir") + " " : ""}${l.skinName} (${l.wear})`).join(" + ")}
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
                              {s.legs?.map((l, i) => (
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
                            {s.outcomes?.map((o, i) => (
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
                                      style={{ color: COLORS.gold, display: "flex", alignItems: "center" }}
                                      title={t("Open the output in the market — check the real price and liquidity before deciding.")}
                                    >
                                      <ExternalLink size={11} />
                                    </a>
                                  )}
                                </span>
                                <span style={{ color: COLORS.textDim, whiteSpace: "nowrap" }}>
                                  {o.prob.toFixed(1)}% · {t("market")} {fmtBRL(o.price)} → {t("net")} {fmtBRL(o.netPrice)}
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
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
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
