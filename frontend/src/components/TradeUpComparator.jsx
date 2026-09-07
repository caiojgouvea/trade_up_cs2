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
import CustomTooltip from "./CustomTooltip";

function breakEvenLabel(stats) {
  if (stats.breakEvenHits10 == null) return "nunca";
  if (stats.breakEvenHits10 === 0) return "sem risco";
  return `≥${stats.breakEvenHits10}/10`;
}

export default function TradeUpComparator() {
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
      <div style={{ maxWidth: 1200, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Crosshair size={22} color={COLORS.gold} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Comparador de Trade-Ups</h1>
        </div>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 640 }}>
          Cadastre os contratos que você mesmo calculou (custo dos 10 inputs + resultados possíveis com
          % e preço de mercado) e compare risco contra retorno num só lugar. O retorno usa o valor líquido
          estimado após a taxa de 15% do Mercado Steam.
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
                <div style={{ overflowX: "auto" }}>
                <table className="tuc-table">
                  <thead>
                    <tr>
                      <th>Contrato</th>
                      <th>Custo</th>
                      <th title="Lucro líquido se sair a saída mais cara possível">Melhor caso</th>
                      <th title="Média ponderada pelas chances de cada saída">Esperado</th>
                      <th title="Lucro líquido se sair a saída mais barata possível">Pior caso</th>
                      <th>Risco</th>
                      <th title="Rodando esse contrato 10x, quantos acertos você precisa pra não sair no prejuízo">Empate em 10x</th>
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
                            title="Acertos = saídas cujo valor líquido cobre o custo. Assume ganho médio e perda média constantes a cada tentativa (aproximação)."
                          >
                            {breakEvenLabel(c.stats)}
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
                            <td colSpan={9} style={{ background: COLORS.panelAlt }}>
                              {c.stats.probOff && (
                                <div style={{ color: COLORS.gold, fontSize: 11, marginBottom: 8 }}>
                                  Atenção: as probabilidades somam {c.stats.totalProbRaw.toFixed(0)}%, não 100%.
                                  O cálculo normalizou automaticamente.
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                Melhor caso: {fmtBRL(c.stats.bestCaseProfit)} ({c.stats.bestCaseRoi >= 0 ? "+" : ""}
                                {c.stats.bestCaseRoi.toFixed(1)}%) · Pior caso: {fmtBRL(c.stats.worstCaseProfit)} (
                                {c.stats.worstCaseRoi >= 0 ? "+" : ""}
                                {c.stats.worstCaseRoi.toFixed(1)}%)
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                Valor esperado líquido: {fmtBRL(c.stats.ev)} · Lucro líquido esperado: {fmtBRL(c.stats.evProfit)} · valor bruto: {fmtBRL(c.stats.grossEv)}
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
                                <strong>Rodando esse contrato 10x</strong> (custo total {fmtBRL(c.cost * 10)}):
                                ganho médio quando acerta {fmtBRL(c.stats.avgWinProfit)} por vez, perda média
                                quando erra {fmtBRL(c.stats.avgLossProfit)} por vez.{" "}
                                {c.stats.breakEvenHits10 == null ? (
                                  <span style={{ color: COLORS.rust }}>
                                    Nenhuma saída cobre o custo — não tem número de acertos que compense.
                                  </span>
                                ) : c.stats.breakEvenHits10 === 0 ? (
                                  <span style={{ color: COLORS.green }}>Nenhuma saída dá prejuízo — sem risco de perder no total das 10x.</span>
                                ) : (
                                  <span style={{ color: COLORS.green }}>
                                    Acertando pelo menos <strong>{c.stats.breakEvenHits10} de 10</strong> tentativas, você já sai no
                                    positivo ou empatado (lucro esperado ×10: {fmtBRL(c.stats.evProfit * 10)}).
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
                <RotateCcw size={13} /> Limpar todos os contratos
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
