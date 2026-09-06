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
import { RefreshCw, ChevronDown, ChevronUp, Check, X, Star } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { rarityColor } from "../lib/rarity";
import { loadFavoriteSuggestions, saveFavoriteSuggestions, suggestionKey } from "../lib/favorites";
import { getSuggestions, syncAllCollections, getSyncAllStatus } from "../lib/api";
import SuggestionsTooltip from "./SuggestionsTooltip";
import ItemThumb from "./ItemThumb";
import FloatCalculator from "./FloatCalculator";

const VERDICT_COLOR = {
  "Bom contrato": COLORS.green,
  Arriscado: COLORS.gold,
  Furada: COLORS.rust,
};

export default function Suggestions() {
  const [suggestions, setSuggestions] = useState([]);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [minListings, setMinListings] = useState(10);
  const [stattrakFilter, setStattrakFilter] = useState("all");
  const [textFilter, setTextFilter] = useState("");
  const [sort, setSort] = useState({ key: "stats.roi", dir: "desc" });
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [calcOpenIdx, setCalcOpenIdx] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [favorites, setFavorites] = useState(() => loadFavoriteSuggestions());
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
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getSuggestions(minListings);
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
    let rows = suggestions;
    if (stattrakFilter !== "all") {
      const want = stattrakFilter === "stattrak";
      rows = rows.filter((s) => s.stattrak === want);
    }
    if (q) {
      rows = rows.filter(
        (s) =>
          s.collectionName.toLowerCase().includes(q) ||
          s.outcomes.some((o) => o.name.toLowerCase().includes(q))
      );
    }
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
  }, [suggestions, stattrakFilter, textFilter, sort, favorites]);

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
      <div style={{ maxWidth: 1200, margin: "0 auto 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Sugestões de Trade-Up</h1>
            <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 640 }}>
              Calculado automaticamente a partir das coleções já sincronizadas: pra cada coleção e
              raridade, o input mais barato disponível contra as saídas possíveis da raridade
              seguinte. Por enquanto só considera trade-ups de uma coleção só (misturar coleções
              ainda não).
            </p>
          </div>
          <button
            className="tuc-btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
            onClick={handleSyncAll}
            disabled={syncStatus?.running}
          >
            <RefreshCw size={13} className={syncStatus?.running ? "tuc-spin" : ""} />
            {syncStatus?.running ? "Sincronizando coleções..." : "Sincronizar todas as coleções"}
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
            {syncStatus.processed}/{syncStatus.total} coleções · buscando agora:{" "}
            {syncStatus.currentName ?? "..."}
            {syncStatus.errors.length > 0 && (
              <span style={{ color: COLORS.rust, marginLeft: 8 }}>
                {syncStatus.errors.length} erro(s)
              </span>
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
            Liquidez mín. (anúncios ativos)
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
            <option value="all">Normal + StatTrak</option>
            <option value="normal">Só Normal</option>
            <option value="stattrak">Só StatTrak</option>
          </select>
          <input
            className="tuc-input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="Filtrar por coleção ou skin..."
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
          {rate && (
            <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: "auto" }}>
              1 USD ≈ {fmtBRL(rate)}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ color: COLORS.textDim, fontSize: 13 }}>Calculando...</div>
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
            Nenhuma sugestão ainda. Sincroniza pelo menos uma coleção na aba "Coleções & Preços"
            (ou clica em "Sincronizar todas as coleções" acima) — precisa de preço em duas
            raridades seguidas dentro da mesma coleção pra calcular alguma coisa.
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
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="probLoss"
                    name="Risco"
                    domain={[0, 100]}
                    tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "IBM Plex Mono" }}
                    label={{ value: "Risco de perda (%)", position: "insideBottom", offset: -12, fill: COLORS.textDim, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="roi"
                    name="Retorno"
                    tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "IBM Plex Mono" }}
                    label={{ value: "Retorno esperado (%)", angle: -90, position: "insideLeft", fill: COLORS.textDim, fontSize: 11 }}
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
                <span><span style={{ color: COLORS.green }}>●</span> Bom contrato</span>
                <span><span style={{ color: COLORS.gold }}>●</span> Arriscado</span>
                <span><span style={{ color: COLORS.rust }}>●</span> Furada</span>
                <span style={{ marginLeft: "auto" }}>tamanho da bolha = custo</span>
              </div>
            </div>

            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tuc-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleSort("collectionName")}>Coleção</th>
                      <th>Raridade</th>
                      <th>ST</th>
                      <th>Entrada mais barata</th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleSort("cost")}>Custo (10x)</th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.roi")}>Retorno esp.</th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.probLoss")}>Risco</th>
                      <th>Veredito</th>
                      <th>Float p/ melhor saída</th>
                      <th>Saídas possíveis</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, idx) => (
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
                              aria-label="Favoritar"
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
                                {s.inputSkin}
                                {s.stattrak && <span style={{ color: COLORS.gold }}> (StatTrak™)</span>}
                                {s.inputWear && (
                                  <span style={{ color: COLORS.textDim }}> ({s.inputWear})</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td>{fmtBRL(s.cost)}</td>
                          <td style={{ color: s.stats.evProfit >= 0 ? COLORS.green : COLORS.rust }}>
                            {s.stats.roi >= 0 ? "+" : ""}
                            {s.stats.roi.toFixed(1)}%
                          </td>
                          <td>{s.stats.probLoss.toFixed(0)}%</td>
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
                              {s.stats.verdict}
                            </span>
                          </td>
                          <td style={{ fontSize: 11 }}>
                            {!s.floatInfo?.available ? (
                              <span style={{ color: COLORS.textDim }}>sem dado</span>
                            ) : s.floatInfo.feasibleWithCheapestInput == null ? (
                              <span
                                style={{ color: COLORS.textDim }}
                                title={`Melhor saída: ${s.floatInfo.bestOutcomeName} (${s.floatInfo.bestOutcomeWear}) · precisa de float médio entre ${fmtFloat(s.floatInfo.requiredAvgFloatMin)} e ${fmtFloat(s.floatInfo.requiredAvgFloatMax)}`}
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
                                title={`Melhor saída: ${s.floatInfo.bestOutcomeName} (${s.floatInfo.bestOutcomeWear}, ${fmtBRL(
                                  s.floatInfo.bestOutcomePrice
                                )}) precisa de float médio entre ${fmtFloat(s.floatInfo.requiredAvgFloatMin)}–${fmtFloat(
                                  s.floatInfo.requiredAvgFloatMax
                                )}. Comprando o input mais barato (${s.floatInfo.inputWear}), seu float fica entre ${fmtFloat(
                                  s.floatInfo.inputAchievableFloatMin
                                )}–${fmtFloat(s.floatInfo.inputAchievableFloatMax)}.`}
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
                                .map(
                                  (o) =>
                                    `${o.name} (${o.predictedWear ?? "média entre wears"}) · ${fmtBRL(o.price)} · ${o.minListings} anúncios`
                                )
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
                                      <span style={{ opacity: 0.7 }}> ({o.predictedWear})</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                              {s.outcomes.length > 3 && (
                                <span style={{ fontSize: 10, color: COLORS.textDim, paddingLeft: 26 }}>
                                  +{s.outcomes.length - 3} mais
                                </span>
                              )}
                            </div>
                          </td>
                          <td></td>
                        </tr>
                        {expandedIdx === idx && (
                          <tr>
                            <td colSpan={12} style={{ background: COLORS.panelAlt }}>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                Valor esperado: {fmtBRL(s.stats.ev)} · Lucro esperado:{" "}
                                {fmtBRL(s.stats.evProfit)} · {s.outcomeCount} saídas possíveis (1/
                                {s.outcomeCount} de chance cada)
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                {s.assumedAvgFloat != null ? (
                                  <>
                                    Preço de cada saída já considera o wear real previsto — assumindo
                                    que você compra o input em <strong>{s.inputWear}</strong> (float
                                    médio ~{fmtFloat(s.assumedAvgFloat)}), não uma média entre wears.
                                  </>
                                ) : (
                                  <>
                                    Sem dado de float pra essa entrada — os preços das saídas aqui são
                                    uma média entre os wears possíveis (aproximação).
                                  </>
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
                                  Melhor saída alcançável:{" "}
                                  <strong>
                                    {s.floatInfo.bestOutcomeName} ({s.floatInfo.bestOutcomeWear})
                                  </strong>{" "}
                                  por {fmtBRL(s.floatInfo.bestOutcomePrice)} — precisa de float médio de
                                  entrada entre{" "}
                                  <strong>
                                    {fmtFloat(s.floatInfo.requiredAvgFloatMin)} e{" "}
                                    {fmtFloat(s.floatInfo.requiredAvgFloatMax)}
                                  </strong>
                                  .{" "}
                                  {s.floatInfo.feasibleWithCheapestInput === false ? (
                                    <span style={{ color: COLORS.rust }}>
                                      Comprando o input mais barato ({s.floatInfo.inputWear}), o float médio
                                      fica entre {fmtFloat(s.floatInfo.inputAchievableFloatMin)} e{" "}
                                      {fmtFloat(s.floatInfo.inputAchievableFloatMax)} — fora dessa faixa, ou
                                      seja, essa saída específica não sai com esse input. Pra mirar nela,
                                      precisa de um input com float mais baixo (mais caro).
                                    </span>
                                  ) : s.floatInfo.feasibleWithCheapestInput === true ? (
                                    <span style={{ color: COLORS.green }}>
                                      O input mais barato ({s.floatInfo.inputWear}) já cai nessa faixa —
                                      dá pra mirar nessa saída sem pagar mais caro no input.
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
                                {calcOpenIdx === idx ? "Fechar calculadora de float" : "Calculadora de float"}
                              </button>
                              {calcOpenIdx === idx && (
                                <FloatCalculator
                                  outcomes={s.outcomes}
                                  defaultOutcomeName={s.floatInfo?.bestOutcomeName}
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
                                    {o.predictedWear && (
                                      <span style={{ color: COLORS.textDim }}>({o.predictedWear})</span>
                                    )}
                                  </span>
                                  <span style={{ color: COLORS.textDim, whiteSpace: "nowrap" }}>
                                    {o.prob.toFixed(1)}% · {fmtBRL(o.price)} · {o.minListings} anúncios
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
