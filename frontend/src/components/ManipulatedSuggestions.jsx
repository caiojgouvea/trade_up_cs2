import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Star, Shuffle, ExternalLink, AlertTriangle } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { rarityColor } from "../lib/rarity";
import { loadFavoriteManipulated, saveFavoriteManipulated, manipulatedKey } from "../lib/favorites";
import { getManipulatedSuggestions } from "../lib/api";
import ItemThumb from "./ItemThumb";

function steamMarketUrl(marketHashName) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
}

function wearLabel(o) {
  if (!o.predictedWear) return "média entre wears";
  return o.priceIsEstimate ? `${o.predictedWear}, preço estimado` : o.predictedWear;
}

const VERDICT_COLOR = {
  "Bom contrato": COLORS.green,
  Arriscado: COLORS.gold,
  Furada: COLORS.rust,
};

export default function ManipulatedSuggestions() {
  const [suggestions, setSuggestions] = useState([]);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [minListings, setMinListings] = useState(10);
  const [stattrakFilter, setStattrakFilter] = useState("all");
  const [textFilter, setTextFilter] = useState("");
  const [sort, setSort] = useState({ key: "stats.roi", dir: "desc" });
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [favorites, setFavorites] = useState(() => loadFavoriteManipulated());

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getManipulatedSuggestions(minListings);
      setSuggestions(data.suggestions);
      setRate(data.rate);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
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
          s.legs.some((l) => l.skinName.toLowerCase().includes(q)) ||
          s.outcomes.some((o) => o.name.toLowerCase().includes(q))
      );
    }
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
  }, [suggestions, stattrakFilter, textFilter, sort, favorites]);

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
          <Shuffle size={18} color={COLORS.gold} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Trade-ups manipulados</h1>
        </div>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 720 }}>
          Em vez de comprar 10 cópias do input mais barato, mistura duas unidades diferentes
          (wears e/ou skins diferentes, mesma raridade e coleção) pra pilotar o float médio de
          entrada pra uma faixa mais barata de atingir. O float de saída é determinístico, então
          isso muda de propósito qual wear cada saída possível vai ter. Só aparece aqui quando a
          mistura bate a estratégia uniforme — a maioria das coleções não ganha nada misturando.
          <strong style={{ color: COLORS.text }}> Atenção: </strong>
          o float usado é o meio da faixa de cada wear (Steam não expõe o float exato de cada
          anúncio antes de comprar), então o resultado é uma estimativa, não garantia — o wear
          real de cada anúncio específico pode variar dentro da faixa.
        </p>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
            <strong style={{ color: COLORS.gold }}>Cuidado ao comprar:</strong> a mistura só funciona
            se você comprar exatamente o wear indicado de cada perna — errar isso destrói o float
            calculado (às vezes o preço entre wears é centavos de diferença, fácil de comprar o
            errado sem perceber). Use o link "abrir no mercado" de cada perna abaixo — ele leva
            direto pra página daquele wear específico, não pra busca geral do item.
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
            Nenhuma mistura vale a pena com os dados sincronizados agora — a maioria das
            coleções não ganha nada manipulando o float, o input mais barato uniforme já é ótimo.
          </div>
        ) : (
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="tuc-table">
                <thead>
                  <tr>
                    <th></th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("collectionName")}>Coleção</th>
                    <th>Raridade</th>
                    <th>ST</th>
                    <th>Mistura de entrada</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("cost")}>Custo (10x)</th>
                    <th>Custo uniforme</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.roi")}>Retorno esp.</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.probLoss")}>Risco</th>
                    <th>Veredito</th>
                    <th>Saídas possíveis</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, idx) => {
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
                              aria-label="Favoritar"
                              style={{ color: favorites.has(key) ? COLORS.gold : COLORS.textDim }}
                            >
                              <Star size={15} fill={favorites.has(key) ? COLORS.gold : "none"} />
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
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {s.legs.map((l, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <ItemThumb iconUrl={l.iconUrl} rarity={s.tier} size={22} />
                                  <span>
                                    {l.count}x {l.skinName}{" "}
                                    <span style={{ color: COLORS.textDim }}>({l.wear})</span>
                                  </span>
                                  <a
                                    href={steamMarketUrl(l.marketHashName)}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: COLORS.gold, display: "flex", alignItems: "center" }}
                                    title="Abrir no mercado (página exata desse wear)"
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
                          <td style={{ maxWidth: 220 }}>
                            <div
                              style={{ display: "flex", flexDirection: "column", gap: 3 }}
                              title={s.outcomes
                                .map((o) => `${o.name} (${wearLabel(o)}) · ${fmtBRL(o.price)} · ${o.minListings} anúncios`)
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
                                  +{s.outcomes.length - 3} mais
                                </span>
                              )}
                            </div>
                          </td>
                          <td></td>
                        </tr>
                        {expandedIdx === idx && (
                          <tr>
                            <td colSpan={11} style={{ background: COLORS.panelAlt }}>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                Valor esperado: {fmtBRL(s.stats.ev)} · Lucro esperado:{" "}
                                {fmtBRL(s.stats.evProfit)} · {s.outcomeCount} saídas possíveis (1/
                                {s.outcomeCount} de chance cada)
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 10 }}>
                                Mistura: {s.legs.map((l) => `${l.count}x ${l.skinName} (${l.wear})`).join(" + ")}{" "}
                                → float médio assumido ~{fmtFloat(s.assumedAvgFloat)} (meio da faixa de
                                cada wear escolhido — não é o float exato de cada anúncio). Custo de{" "}
                                {fmtBRL(s.cost)} contra {fmtBRL(s.baselineCost)} da estratégia uniforme
                                (10x a entrada mais barata){s.baselineRoi != null && (
                                  <> — que rende {s.baselineRoi >= 0 ? "+" : ""}
                                  {s.baselineRoi.toFixed(1)}% sozinha, contra {s.stats.roi >= 0 ? "+" : ""}
                                  {s.stats.roi.toFixed(1)}% misturando</>
                                )}.
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
                                <span style={{ fontSize: 10, color: COLORS.textDim, textTransform: "uppercase" }}>
                                  Comprar exatamente isso (clique pra abrir a página certa de cada wear):
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
                                    {l.count}x {l.skinName} ({l.wear}) — {fmtBRL(l.unitPriceBrl)} cada
                                    <ExternalLink size={12} />
                                  </a>
                                ))}
                              </div>
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
                                      ({wearLabel(o)})
                                    </span>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
