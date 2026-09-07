import React, { useState, useMemo } from "react";
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
import { Plus, Trash2, ChevronDown, ChevronUp, Crosshair, RotateCcw } from "lucide-react";
import { COLORS } from "../lib/colors";
import { computeStats, fmtBRL } from "../lib/tradeUpMath";
import { loadContracts, saveContracts } from "../lib/storage";
import { useI18n } from "../lib/i18n";
import CustomTooltip from "./CustomTooltip";

function breakEvenLabel(stats, t) {
  if (stats.breakEvenHits10 == null) return t("never");
  if (stats.breakEvenHits10 === 0) return t("risk-free");
  return `≥${stats.breakEvenHits10}/10`;
}

export default function TradeUpComparator() {
  const { t, currency } = useI18n();
  const [contracts, setContracts] = useState(() => loadContracts());
  const [expandedId, setExpandedId] = useState(null);
  const [formError, setFormError] = useState("");

  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [outcomes, setOutcomes] = useState([{ name: "", prob: "", price: "" }]);

  function persist(next) {
    setContracts(next);
    saveContracts(next);
  }

  function updateOutcome(i, field, value) {
    const next = outcomes.slice();
    next[i] = { ...next[i], [field]: value };
    setOutcomes(next);
  }

  function addOutcomeRow() {
    setOutcomes([...outcomes, { name: "", prob: "", price: "" }]);
  }

  function removeOutcomeRow(i) {
    if (outcomes.length === 1) return;
    setOutcomes(outcomes.filter((_, idx) => idx !== i));
  }

  function resetForm() {
    setName("");
    setCost("");
    setOutcomes([{ name: "", prob: "", price: "" }]);
    setFormError("");
  }

  function handleAdd() {
    setFormError("");
    const validOutcomes = outcomes.filter(
      (o) => o.name.trim() && o.prob !== "" && o.price !== ""
    );
    if (!name.trim()) return setFormError(t("Give the contract a name."));
    if (!cost || Number(cost) <= 0) return setFormError(t("Total cost of the 10 inputs must be > 0."));
    if (validOutcomes.length === 0)
      return setFormError(t("Add at least 1 possible outcome with % and price."));

    const newContract = {
      id: Date.now(),
      name: name.trim(),
      cost: Number(cost),
      outcomes: validOutcomes.map((o) => ({
        name: o.name.trim(),
        prob: Number(o.prob),
        price: Number(o.price),
      })),
    };
    persist([newContract, ...contracts]);
    resetForm();
  }

  function handleRemoveContract(id) {
    persist(contracts.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  const enriched = useMemo(
    () => contracts.map((c) => ({ ...c, stats: computeStats(c) })),
    [contracts]
  );

  const scatterData = enriched.map((c) => ({
    name: c.name,
    probLoss: c.stats.probLoss,
    roi: c.stats.roi,
    cost: c.cost,
    color: c.stats.verdictColor,
    id: c.id,
  }));

  const currencySymbol = currency === "brl" ? "R$" : "$";

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
      <div style={{ maxWidth: "min(1800px, 96vw)", margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Crosshair size={22} color={COLORS.gold} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t("Trade-Up Comparator")}</h1>
        </div>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 640 }}>
          {t(
            "Register contracts you calculated yourself (cost of the 10 inputs + possible outcomes with % and market price) and compare risk against return in one place. Return uses the estimated net value after the Steam Market's 15% fee."
          )}
        </p>
      </div>

      <div className="tuc-grid">
        {/* FORM */}
        <div
          style={{
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: 16,
            alignSelf: "start",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{t("New contract")}</div>

          <label style={{ fontSize: 11, color: COLORS.textDim }}>{t("Contract name")}</label>
          <input
            className="tuc-input"
            style={{ marginTop: 4, marginBottom: 10 }}
            placeholder={t("e.g. Kilowatt Restricted → AK Inheritance")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label style={{ fontSize: 11, color: COLORS.textDim }}>{t("Total cost of the 10 inputs")} ({currencySymbol})</label>
          <input
            className="tuc-input"
            style={{ marginTop: 4, marginBottom: 14 }}
            placeholder={t("e.g. 180")}
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />

          <label style={{ fontSize: 11, color: COLORS.textDim }}>{t("Possible outcomes")}</label>
          <div style={{ marginTop: 6 }}>
            <div className="tuc-outcome-row" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: COLORS.textDim }}>{t("Skin")}</span>
              <span style={{ fontSize: 10, color: COLORS.textDim }}>%</span>
              <span style={{ fontSize: 10, color: COLORS.textDim }}>{currencySymbol}</span>
              <span />
            </div>
            {outcomes.map((o, i) => (
              <div className="tuc-outcome-row" key={i}>
                <input
                  className="tuc-input"
                  placeholder={t("e.g. AK Inheritance")}
                  value={o.name}
                  onChange={(e) => updateOutcome(i, "name", e.target.value)}
                />
                <input
                  className="tuc-input"
                  type="number"
                  placeholder="20"
                  value={o.prob}
                  onChange={(e) => updateOutcome(i, "prob", e.target.value)}
                />
                <input
                  className="tuc-input"
                  type="number"
                  placeholder="300"
                  value={o.price}
                  onChange={(e) => updateOutcome(i, "price", e.target.value)}
                />
                <button className="tuc-icon-btn" onClick={() => removeOutcomeRow(i)} aria-label={t("Remove")}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="tuc-btn-ghost"
            style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
            onClick={addOutcomeRow}
          >
            <Plus size={13} /> {t("Add outcome")}
          </button>

          {formError && (
            <div style={{ color: COLORS.rust, fontSize: 12, marginTop: 10 }}>{formError}</div>
          )}

          <button className="tuc-btn" style={{ marginTop: 14, width: "100%" }} onClick={handleAdd}>
            {t("Save contract")}
          </button>
        </div>

        {/* RESULTS */}
        <div>
          {contracts.length === 0 ? (
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
              {t("No contracts registered yet. Fill in the form on the side to start comparing.")}
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
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="probLoss"
                      name={t("Risk")}
                      domain={[0, 100]}
                      tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "IBM Plex Mono" }}
                      label={{
                        value: t("Loss risk (%)"),
                        position: "insideBottom",
                        offset: -12,
                        fill: COLORS.textDim,
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="roi"
                      name={t("Return")}
                      tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "IBM Plex Mono" }}
                      label={{
                        value: t("Expected return (%)"),
                        angle: -90,
                        position: "insideLeft",
                        fill: COLORS.textDim,
                        fontSize: 11,
                      }}
                    />
                    <ZAxis type="number" dataKey="cost" range={[80, 400]} />
                    <ReferenceLine y={0} stroke={COLORS.textDim} strokeDasharray="4 4" />
                    <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={scatterData}>
                      {scatterData.map((d) => (
                        <Cell key={d.id} fill={d.color} fillOpacity={0.85} />
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

              <div
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                <table className="tuc-table">
                  <thead>
                    <tr>
                      <th>{t("Contract")}</th>
                      <th>{t("Cost")}</th>
                      <th title={t("Net profit if the most expensive possible output comes out")}>{t("Best case")}</th>
                      <th title={t("Average weighted by the odds of each output")}>{t("Expected")}</th>
                      <th title={t("Net profit if the cheapest possible output comes out")}>{t("Worst case")}</th>
                      <th>{t("Risk")}</th>
                      <th title={t("Running this contract 10x, how many hits you need to not end up at a loss")}>{t("Break-even in 10x")}</th>
                      <th>{t("Verdict")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((c) => (
                      <React.Fragment key={c.id}>
                        <tr
                          style={{ cursor: "pointer" }}
                          onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        >
                          <td style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {expandedId === c.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              {c.name}
                            </div>
                          </td>
                          <td>{fmtBRL(c.cost)}</td>
                          <td style={{ color: c.stats.bestCaseProfit >= 0 ? COLORS.green : COLORS.rust }}>
                            {c.stats.bestCaseRoi >= 0 ? "+" : ""}
                            {c.stats.bestCaseRoi.toFixed(1)}%
                          </td>
                          <td style={{ color: c.stats.evProfit >= 0 ? COLORS.green : COLORS.rust }}>
                            {c.stats.roi >= 0 ? "+" : ""}
                            {c.stats.roi.toFixed(1)}%
                          </td>
                          <td style={{ color: c.stats.worstCaseProfit >= 0 ? COLORS.green : COLORS.rust }}>
                            {c.stats.worstCaseRoi >= 0 ? "+" : ""}
                            {c.stats.worstCaseRoi.toFixed(1)}%
                          </td>
                          <td>{c.stats.probLoss.toFixed(0)}%</td>
                          <td
                            style={{ color: c.stats.breakEvenHits10 == null ? COLORS.rust : COLORS.textDim, fontSize: 11 }}
                            title={t("Hits = outputs whose net value covers the cost. Assumes constant average win and average loss per attempt (approximation).")}
                          >
                            {breakEvenLabel(c.stats, t)}
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                color: c.stats.verdictColor,
                                border: `1px solid ${c.stats.verdictColor}`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                fontSize: 11,
                                lineHeight: 1.3,
                                textAlign: "center",
                              }}
                            >
                              {t(c.stats.verdict)}
                            </span>
                          </td>
                          <td>
                            <button
                              className="tuc-icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveContract(c.id);
                              }}
                              aria-label={t("Delete contract")}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {expandedId === c.id && (
                          <tr>
                            <td colSpan={9} style={{ background: COLORS.panelAlt }}>
                              {c.stats.probOff && (
                                <div style={{ color: COLORS.gold, fontSize: 11, marginBottom: 8 }}>
                                  {t("Warning: the probabilities add up to")} {c.stats.totalProbRaw.toFixed(0)}%, {t("not 100%. The calculation normalized automatically.")}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                {t("Best case")}: {fmtBRL(c.stats.bestCaseProfit)} ({c.stats.bestCaseRoi >= 0 ? "+" : ""}
                                {c.stats.bestCaseRoi.toFixed(1)}%) · {t("Worst case")}: {fmtBRL(c.stats.worstCaseProfit)} (
                                {c.stats.worstCaseRoi >= 0 ? "+" : ""}
                                {c.stats.worstCaseRoi.toFixed(1)}%)
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                {t("Net expected value")}: {fmtBRL(c.stats.ev)} · {t("Net expected profit")}: {fmtBRL(c.stats.evProfit)} · {t("gross value")}: {fmtBRL(c.stats.grossEv)}
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
                                <strong>{t("Running this contract 10x")}</strong> ({t("total cost")} {fmtBRL(c.cost * 10)}):{" "}
                                {t("average win")} {fmtBRL(c.stats.avgWinProfit)} {t("per hit")}, {t("average loss")}{" "}
                                {fmtBRL(c.stats.avgLossProfit)} {t("per miss")}.{" "}
                                {c.stats.breakEvenHits10 == null ? (
                                  <span style={{ color: COLORS.rust }}>
                                    {t("No output covers the cost — no number of hits makes this worth it.")}
                                  </span>
                                ) : c.stats.breakEvenHits10 === 0 ? (
                                  <span style={{ color: COLORS.green }}>{t("No output results in a loss — no risk of losing across all 10x.")}</span>
                                ) : (
                                  <span style={{ color: COLORS.green }}>
                                    {t("Hitting at least")} <strong>{c.stats.breakEvenHits10} {t("of 10")}</strong> {t("attempts already gets you to break-even or profit")} ({t("expected profit")} ×10: {fmtBRL(c.stats.evProfit * 10)}).
                                  </span>
                                )}
                              </div>
                              {c.outcomes.map((o, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 12,
                                    padding: "4px 0",
                                    borderBottom:
                                      i < c.outcomes.length - 1 ? `1px solid ${COLORS.border}` : "none",
                                  }}
                                >
                                  <span>{o.name}</span>
                                  <span style={{ color: COLORS.textDim }}>
                                    {o.prob}% · {fmtBRL(o.price)}
                                  </span>
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              <button
                className="tuc-btn-ghost"
                style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
                onClick={() => persist([])}
              >
                <RotateCcw size={13} /> {t("Clear all contracts")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
