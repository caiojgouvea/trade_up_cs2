import React, { useState, useEffect, useMemo } from "react";
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

const COLORS = {
  bg: "#11141a",
  panel: "#1a1f28",
  panelAlt: "#20262f",
  border: "#2a313c",
  text: "#e7e4dc",
  textDim: "#8b909c",
  gold: "#d4a24e",
  rust: "#b8563a",
  green: "#7a9d5a",
  blue: "#5b7ea3",
};

function computeStats(contract) {
  const totalProbRaw = contract.outcomes.reduce((s, o) => s + Number(o.prob || 0), 0) || 1;
  const ev = contract.outcomes.reduce(
    (s, o) => s + (Number(o.prob || 0) / totalProbRaw) * Number(o.price || 0),
    0
  );
  const cost = Number(contract.cost || 0);
  const evProfit = ev - cost;
  const roi = cost > 0 ? (evProfit / cost) * 100 : 0;
  const probLoss =
    (contract.outcomes
      .filter((o) => Number(o.price || 0) < cost)
      .reduce((s, o) => s + Number(o.prob || 0), 0) /
      totalProbRaw) *
    100;
  const best = contract.outcomes.reduce(
    (m, o) => (Number(o.price) > Number(m.price || -Infinity) ? o : m),
    {}
  );

  let verdict, verdictColor;
  if (roi > 15 && probLoss < 40) {
    verdict = "Bom contrato";
    verdictColor = COLORS.green;
  } else if (roi > 0) {
    verdict = "Arriscado";
    verdictColor = COLORS.gold;
  } else {
    verdict = "Furada";
    verdictColor = COLORS.rust;
  }

  return {
    ev,
    evProfit,
    roi,
    probLoss: Math.min(100, Math.max(0, probLoss)),
    verdict,
    verdictColor,
    probOff: Math.abs(totalProbRaw - 100) > 1,
    totalProbRaw,
  };
}

function fmtBRL(n) {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: COLORS.panelAlt,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: "10px 12px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        color: COLORS.text,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
      <div>Risco de perda: {d.probLoss.toFixed(0)}%</div>
      <div>Retorno esperado: {d.roi.toFixed(1)}%</div>
      <div>Custo: {fmtBRL(d.cost)}</div>
    </div>
  );
}

export default function TradeUpComparator() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [formError, setFormError] = useState("");

  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [outcomes, setOutcomes] = useState([{ name: "", prob: "", price: "" }]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("trade-up-contracts");
        if (res && res.value) setContracts(JSON.parse(res.value));
      } catch (e) {
        // no saved data yet, that's fine
      }
      setLoading(false);
    })();
  }, []);

  async function persist(next) {
    setContracts(next);
    try {
      await window.storage.set("trade-up-contracts", JSON.stringify(next));
    } catch (e) {
      console.error("Falha ao salvar:", e);
    }
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
    if (!name.trim()) return setFormError("Dá um nome pro contrato.");
    if (!cost || Number(cost) <= 0) return setFormError("Custo total dos 10 inputs precisa ser > 0.");
    if (validOutcomes.length === 0)
      return setFormError("Adiciona pelo menos 1 resultado possível com % e preço.");

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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .tuc-input {
          background: ${COLORS.panelAlt};
          border: 1px solid ${COLORS.border};
          color: ${COLORS.text};
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          padding: 8px 10px;
          border-radius: 5px;
          width: 100%;
          box-sizing: border-box;
          outline: none;
        }
        .tuc-input:focus { border-color: ${COLORS.gold}; }
        .tuc-input::placeholder { color: ${COLORS.textDim}; }
        .tuc-btn {
          background: ${COLORS.gold};
          color: #1a1408;
          border: none;
          border-radius: 5px;
          padding: 9px 14px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
        }
        .tuc-btn:hover { filter: brightness(1.08); }
        .tuc-btn-ghost {
          background: transparent;
          border: 1px solid ${COLORS.border};
          color: ${COLORS.textDim};
          border-radius: 5px;
          padding: 8px 10px;
          cursor: pointer;
        }
        .tuc-btn-ghost:hover { color: ${COLORS.text}; border-color: ${COLORS.textDim}; }
        .tuc-icon-btn {
          background: transparent;
          border: none;
          color: ${COLORS.textDim};
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }
        .tuc-icon-btn:hover { color: ${COLORS.rust}; }
        .tuc-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (max-width: 820px) {
          .tuc-grid { grid-template-columns: 1fr; }
        }
        .tuc-outcome-row {
          display: grid;
          grid-template-columns: 1fr 56px 70px 24px;
          gap: 6px;
          margin-bottom: 6px;
          align-items: center;
        }
        table.tuc-table { width: 100%; border-collapse: collapse; font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
        table.tuc-table th { text-align: left; color: ${COLORS.textDim}; font-weight: 500; font-size: 11px; text-transform: none; padding: 6px 10px; border-bottom: 1px solid ${COLORS.border}; }
        table.tuc-table td { padding: 10px; border-bottom: 1px solid ${COLORS.border}; vertical-align: top; }
        table.tuc-table tr:hover td { background: ${COLORS.panelAlt}; }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Crosshair size={22} color={COLORS.gold} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Comparador de Trade-Ups</h1>
        </div>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 640 }}>
          Cadastre os contratos que você mesmo calculou (custo dos 10 inputs + resultados possíveis com
          % e preço) e compare risco contra retorno num só lugar.
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
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Novo contrato</div>

          <label style={{ fontSize: 11, color: COLORS.textDim }}>Nome do contrato</label>
          <input
            className="tuc-input"
            style={{ marginTop: 4, marginBottom: 10 }}
            placeholder="ex: Kilowatt Restricted → AK Inheritance"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label style={{ fontSize: 11, color: COLORS.textDim }}>Custo total dos 10 inputs (R$)</label>
          <input
            className="tuc-input"
            style={{ marginTop: 4, marginBottom: 14 }}
            placeholder="ex: 180"
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />

          <label style={{ fontSize: 11, color: COLORS.textDim }}>Resultados possíveis</label>
          <div style={{ marginTop: 6 }}>
            <div className="tuc-outcome-row" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: COLORS.textDim }}>Skin</span>
              <span style={{ fontSize: 10, color: COLORS.textDim }}>%</span>
              <span style={{ fontSize: 10, color: COLORS.textDim }}>R$</span>
              <span />
            </div>
            {outcomes.map((o, i) => (
              <div className="tuc-outcome-row" key={i}>
                <input
                  className="tuc-input"
                  placeholder="ex: AK Inheritance"
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
                <button className="tuc-icon-btn" onClick={() => removeOutcomeRow(i)} aria-label="Remover">
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
            <Plus size={13} /> Adicionar resultado
          </button>

          {formError && (
            <div style={{ color: COLORS.rust, fontSize: 12, marginTop: 10 }}>{formError}</div>
          )}

          <button className="tuc-btn" style={{ marginTop: 14, width: "100%" }} onClick={handleAdd}>
            Salvar contrato
          </button>
        </div>

        {/* RESULTS */}
        <div>
          {loading ? (
            <div style={{ color: COLORS.textDim, fontSize: 13 }}>Carregando...</div>
          ) : contracts.length === 0 ? (
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
              Nenhum contrato cadastrado ainda. Preenche o formulário ao lado pra começar a comparar.
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
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Risco × Retorno</div>
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="probLoss"
                      name="Risco"
                      domain={[0, 100]}
                      tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "IBM Plex Mono" }}
                      label={{
                        value: "Risco de perda (%)",
                        position: "insideBottom",
                        offset: -12,
                        fill: COLORS.textDim,
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="roi"
                      name="Retorno"
                      tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "IBM Plex Mono" }}
                      label={{
                        value: "Retorno esperado (%)",
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
                  <span><span style={{ color: COLORS.green }}>●</span> Bom contrato</span>
                  <span><span style={{ color: COLORS.gold }}>●</span> Arriscado</span>
                  <span><span style={{ color: COLORS.rust }}>●</span> Furada</span>
                  <span style={{ marginLeft: "auto" }}>tamanho da bolha = custo</span>
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
                <table className="tuc-table">
                  <thead>
                    <tr>
                      <th>Contrato</th>
                      <th>Custo</th>
                      <th>Retorno esp.</th>
                      <th>Risco</th>
                      <th>Veredito</th>
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
                          <td style={{ color: c.stats.evProfit >= 0 ? COLORS.green : COLORS.rust }}>
                            {c.stats.roi >= 0 ? "+" : ""}
                            {c.stats.roi.toFixed(1)}%
                          </td>
                          <td>{c.stats.probLoss.toFixed(0)}%</td>
                          <td>
                            <span
                              style={{
                                color: c.stats.verdictColor,
                                border: `1px solid ${c.stats.verdictColor}`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                fontSize: 11,
                              }}
                            >
                              {c.stats.verdict}
                            </span>
                          </td>
                          <td>
                            <button
                              className="tuc-icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveContract(c.id);
                              }}
                              aria-label="Excluir contrato"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {expandedId === c.id && (
                          <tr>
                            <td colSpan={6} style={{ background: COLORS.panelAlt }}>
                              {c.stats.probOff && (
                                <div style={{ color: COLORS.gold, fontSize: 11, marginBottom: 8 }}>
                                  Atenção: as probabilidades somam {c.stats.totalProbRaw.toFixed(0)}%, não 100%.
                                  O cálculo normalizou automaticamente.
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                Valor esperado: {fmtBRL(c.stats.ev)} · Lucro esperado: {fmtBRL(c.stats.evProfit)}
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

              <button
                className="tuc-btn-ghost"
                style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
                onClick={() => persist([])}
              >
                <RotateCcw size={13} /> Limpar todos os contratos
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
