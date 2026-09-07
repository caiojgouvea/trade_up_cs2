import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, History } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { rarityColor } from "../lib/rarity";
import { getSuggestionHistory } from "../lib/api";
import ItemThumb from "./ItemThumb";
import Pagination from "./Pagination";

function steamMarketUrl(marketHashName) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
}

function wearLabel(o) {
  if (!o.predictedWear) return "média entre wears";
  const withFloat = o.predictedFloatValue != null ? ` · float ${fmtFloat(o.predictedFloatValue)}` : "";
  return (o.priceIsEstimate ? `${o.predictedWear}, preço estimado` : o.predictedWear) + withFloat;
}

function breakEvenLabel(stats) {
  if (stats.breakEvenHits10 == null) return "nunca";
  if (stats.breakEvenHits10 === 0) return "sem risco";
  return `≥${stats.breakEvenHits10}/10`;
}

const SORT_OPTIONS = [
  { value: "bestCaseRoi", label: "Melhor caso" },
  { value: "roi", label: "Esperado" },
  { value: "worstCaseRoi", label: "Pior caso" },
  { value: "computedAt", label: "Mais recente" },
];

export default function SuggestionHistory() {
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
      <div style={{ maxWidth: 1200, margin: "0 auto 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <History size={18} color={COLORS.gold} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Histórico de achados</h1>
        </div>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 720 }}>
          Todo contrato "manipulado" (misturando entradas e/ou coleções) que já apareceu numa
          rodada de recálculo — manual ou "busca exaustiva" — fica registrado aqui pra sempre,
          mesmo que o preço mude depois e ele suma da lista atual. Dispare rodadas na aba
          "Manipulados" pra alimentar esse histórico.
        </p>
        {stats && (
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
            {stats.entries} achados registrados em {stats.runs} rodada(s)
            {stats.firstAt && (
              <>
                {" "}
                · primeira em {new Date(stats.firstAt).toLocaleString("pt-BR")} · última em{" "}
                {new Date(stats.lastAt).toLocaleString("pt-BR")}
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
            Ordenar por
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
            Esperado mín. %
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
            Melhor caso mín. %
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
          <div style={{ color: COLORS.textDim, fontSize: 13 }}>Carregando...</div>
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
            Nada registrado ainda. Vá na aba "Manipulados" e clique em "Recalcular" ou "Busca
            exaustiva" pelo menos uma vez — cada rodada alimenta esse histórico.
          </div>
        ) : (
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="tuc-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Coleção</th>
                    <th>Raridade</th>
                    <th>ST</th>
                    <th>Pernas</th>
                    <th>Custo</th>
                    <th>Melhor caso</th>
                    <th>Esperado</th>
                    <th>Pior caso</th>
                    <th>Risco</th>
                    <th title="Rodando esse contrato 10x, quantos acertos você precisa pra não sair no prejuízo">Empate em 10x</th>
                    <th>Achado em</th>
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
                              title="Mistura mais de uma coleção"
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
                              Cross-coleção
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
                          title="Acertos = saídas cujo valor líquido cobre o custo. Assume ganho médio e perda média constantes a cada tentativa (aproximação)."
                        >
                          {breakEvenLabel(s.stats)}
                        </td>
                        <td style={{ fontSize: 11, color: COLORS.textDim, whiteSpace: "nowrap" }}>
                          {new Date(s.computedAt).toLocaleString("pt-BR")}
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <tr>
                          <td colSpan={12} style={{ background: COLORS.panelAlt }}>
                            <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 10 }}>
                              Mistura: {s.legs?.map((l) => `${l.count}x ${l.isSouvenir ? "Lembrança " : ""}${l.skinName} (${l.wear})`).join(" + ")}
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
                              <strong>Rodando esse contrato 10x</strong> (custo total {fmtBRL(s.cost * 10)}):
                              ganho médio quando acerta {fmtBRL(s.stats.avgWinProfit)} por vez, perda média
                              quando erra {fmtBRL(s.stats.avgLossProfit)} por vez.{" "}
                              {s.stats.breakEvenHits10 == null ? (
                                <span style={{ color: COLORS.rust }}>
                                  Nenhuma saída cobre o custo — não tem número de acertos que compense.
                                </span>
                              ) : s.stats.breakEvenHits10 === 0 ? (
                                <span style={{ color: COLORS.green }}>Nenhuma saída dá prejuízo — sem risco de perder no total das 10x.</span>
                              ) : (
                                <span style={{ color: COLORS.green }}>
                                  Acertando pelo menos <strong>{s.stats.breakEvenHits10} de 10</strong> tentativas, você já sai no
                                  positivo ou empatado (lucro esperado ×10: {fmtBRL(s.stats.evProfit * 10)}).
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
                                  {l.count}x {l.isSouvenir && "Lembrança "}
                                  {l.skinName} ({l.wear}) — {fmtBRL(l.unitPriceBrl)} cada
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
                                    ({wearLabel(o)})
                                  </span>
                                </span>
                                <span style={{ color: COLORS.textDim, whiteSpace: "nowrap" }}>
                                  {o.prob.toFixed(1)}% · mercado {fmtBRL(o.price)} → líquido {fmtBRL(o.netPrice)}
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
