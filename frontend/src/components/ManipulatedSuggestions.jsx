import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Star, Shuffle, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { rarityColor } from "../lib/rarity";
import { loadFavoriteManipulated, saveFavoriteManipulated, manipulatedKey } from "../lib/favorites";
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
  }, []);

  useEffect(() => {
    if (!jobStatus?.running) return undefined;

    const timer = setInterval(async () => {
      try {
        const next = await getManipulatedRefreshStatus();
        setJobStatus(next);
        if (!next.running) {
          if (next.error) {
            setError(`O recálculo falhou: ${next.error}`);
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
      const data = await getManipulatedSuggestions(targetMinListings);
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
      const status = await refreshManipulatedSuggestions(minListings, exhaustive);
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
          o float usado é o pior limite da faixa de cada wear (Steam não expõe o float exato de cada
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
            se você comprar exatamente o wear (e StatTrak™, quando marcado) indicado de cada
            perna — errar isso destrói o float calculado. O link "abrir no mercado" leva pra
            página certa da arma+skin, mas a Steam mudou o site: <strong>StatTrak™ e cada wear
            agora são filtros dentro da mesma página</strong>, não páginas separadas — o link NÃO
            seleciona isso sozinho. Depois de abrir, marque manualmente o filtro StatTrak™ (se a
            perna pedir) e o wear exato antes de comprar. Isso pegou um usuário de surpresa: ele
            clicou no link de uma perna StatTrak e acabou comprando a versão Normal por engano,
            porque a página abre com Normal marcado por padrão.
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
          <strong style={{ color: COLORS.green }}>Modo conservador:</strong> o retorno é líquido após a taxa estimada do Mercado Steam e só usa o preço direto do wear previsto para todas as saídas.
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
            Liquidez mín. (anúncios ativos)
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
            title="Recalcula com o pool otimizado. O resultado anterior continua disponível até terminar."
          >
            <RefreshCw size={13} className={jobStatus?.running ? "tuc-spin" : ""} />
            {jobStatus?.running ? "Recalculando..." : "Recalcular"}
          </button>
          <button
            className="tuc-btn-ghost"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => handleRefresh(true)}
            disabled={jobStatus?.running}
            title="Testa todos os itens coringa. Pode levar horas e continua rodando no servidor."
          >
            Busca exaustiva
          </button>
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
          <select
            className="tuc-input"
            style={{ width: 160 }}
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
          >
            <option value="all">Qualquer raridade de saída</option>
            {rarityOptions.map((r) => (
              <option key={r} value={r}>
                Saída: {r}
              </option>
            ))}
          </select>
          <select
            className="tuc-input"
            style={{ width: 155 }}
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="all">Qualquer risco</option>
            <option value="high">Risco alto (45%+)</option>
            <option value="fifty">50/50 exato</option>
          </select>
          <input
            className="tuc-input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="Filtrar por coleção ou skin..."
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
          <label style={{ fontSize: 11, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 6 }}>
            Custo
            <input
              className="tuc-input"
              style={{ width: 80 }}
              placeholder="mín."
              value={minCost}
              onChange={(e) => setMinCost(e.target.value)}
            />
            <span>–</span>
            <input
              className="tuc-input"
              style={{ width: 80 }}
              placeholder="máx."
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 11, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 6 }}>
            Risco %
            <input
              className="tuc-input"
              style={{ width: 60 }}
              placeholder="mín."
              value={minRisk}
              onChange={(e) => setMinRisk(e.target.value)}
            />
            <span>–</span>
            <input
              className="tuc-input"
              style={{ width: 60 }}
              placeholder="máx."
              value={maxRisk}
              onChange={(e) => setMaxRisk(e.target.value)}
            />
          </label>
          {rate && (
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
              ? `Calculando ${jobStatus.exhaustive ? "em modo exaustivo" : "em modo otimizado"} com liquidez mínima ${jobStatus.minListings}... A página continua utilizável.`
              : `Resultado em cache: ${new Date(cacheInfo.computedAt).toLocaleString("pt-BR")} · liquidez mínima ${cacheInfo.minListings}${cacheInfo.exhaustive ? " · busca exaustiva" : ""}.`}
          </div>
        )}

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
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.bestCaseRoi")} title="Lucro líquido se sair a saída mais cara possível">Melhor caso</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.roi")} title="Média ponderada pelas chances de cada saída">Esperado</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.worstCaseRoi")} title="Lucro líquido se sair a saída mais barata possível">Pior caso</th>
                    <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stats.probLoss")}>Risco</th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleSort("stats.breakEvenHits10")}
                      title="Rodando esse contrato 10x, quantos acertos (saída que cobre o custo) você precisa pra não sair no prejuízo"
                    >
                      Empate em 10x
                    </th>
                    <th>Veredito</th>
                    <th>Saídas possíveis</th>
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
                              {s.crossCollection && (
                                <span
                                  title="Usa coringa de outra coleção pra ajustar o float — parte da chance de saída vem dessa outra coleção"
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
                                  Cross-coleção
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
                                    {l.count}x {l.isSouvenir && <span style={{ color: COLORS.gold }}>Lembrança </span>}
                                    {l.skinName}{" "}
                                    <span
                                      style={{ color: COLORS.textDim }}
                                      title={
                                        l.floatRange
                                          ? `Faixa de float própria dessa skin: ${fmtFloat(l.floatRange.min)}–${fmtFloat(
                                              l.floatRange.max
                                            )}. O desgaste RELATIVO dela (o que entra na conta) depende dessa
                                            faixa, não é igual entre skins diferentes.`
                                          : undefined
                                      }
                                    >
                                      ({l.wear})
                                    </span>
                                    {l.collectionTag !== s.collectionTag && (
                                      <span style={{ color: COLORS.rust }}> — coringa ({l.collectionName})</span>
                                    )}
                                  </span>
                                  <a
                                    href={steamMarketUrl(l.marketHashName)}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: COLORS.gold, display: "flex", alignItems: "center" }}
                                    title="Abrir no mercado — marque o filtro StatTrak™ e wear certo na página, o link não seleciona sozinho"
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
                            title="Acertos = saídas cujo valor líquido cobre o custo. Assume ganho médio e perda média constantes a cada tentativa (aproximação)."
                          >
                            {breakEvenLabel(s.stats)}
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
                                    {o.fromCollectionTag !== s.collectionTag && (
                                      <span style={{ color: COLORS.rust }}> · outra coleção</span>
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
                            <td colSpan={14} style={{ background: COLORS.panelAlt }}>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                Melhor caso: {fmtBRL(s.stats.bestCaseProfit)} ({s.stats.bestCaseRoi >= 0 ? "+" : ""}
                                {s.stats.bestCaseRoi.toFixed(1)}%) · Pior caso: {fmtBRL(s.stats.worstCaseProfit)} (
                                {s.stats.worstCaseRoi >= 0 ? "+" : ""}
                                {s.stats.worstCaseRoi.toFixed(1)}%)
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                                Valor esperado líquido: {fmtBRL(s.stats.ev)} · Lucro líquido esperado:{" "}
                                {fmtBRL(s.stats.evProfit)} · {s.outcomeCount} saídas possíveis
                                {!s.crossCollection && <> (1/{s.outcomeCount} de chance cada)</>}
                              </div>
                              <div style={{ fontSize: 11, color: COLORS.gold, marginBottom: 10 }}>
                                Retorno já desconta a taxa do Mercado Steam (estimativa de 15%). Só entram saídas com preço direto para o wear previsto.
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
                              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 10 }}>
                                Mistura: {s.legs.map((l) => `${l.count}x ${l.isSouvenir ? "Lembrança " : ""}${l.skinName} (${l.wear})`).join(" + ")}{" "}
                                → float relativo médio ~{fmtFloat(s.assumedAvgFloat)} (posição entre
                                0–1 dentro da faixa própria de cada skin de entrada, não o float bruto
                                — e pode virar um wear bem diferente do que "parece" na saída, se a
                                skin de saída tiver faixa de float diferente da de entrada; meio da
                                pior limite de cada wear escolhido, não o float exato de cada anúncio). Custo
                                de{" "}
                                {fmtBRL(s.cost)} contra {fmtBRL(s.baselineCost)} da estratégia uniforme
                                (10x a entrada mais barata){s.baselineRoi != null && (
                                  <> — que rende {s.baselineRoi >= 0 ? "+" : ""}
                                  {s.baselineRoi.toFixed(1)}% sozinha, contra {s.stats.roi >= 0 ? "+" : ""}
                                  {s.stats.roi.toFixed(1)}% misturando</>
                                )}.
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
                                  <strong style={{ color: COLORS.rust }}>Cross-coleção:</strong>{" "}
                                  {[...new Set(
                                    s.legs.filter((l) => l.collectionTag !== s.collectionTag).map((l) => l.collectionName)
                                  )].length > 1 ? (
                                    <>
                                      pernas vêm de <strong>{[...new Set(
                                        s.legs.filter((l) => l.collectionTag !== s.collectionTag).map((l) => l.collectionName)
                                      )].join(" e ")}</strong>
                                    </>
                                  ) : (
                                    <>
                                      uma das pernas é de{" "}
                                      <strong>{s.legs.find((l) => l.collectionTag !== s.collectionTag)?.collectionName}</strong>
                                    </>
                                  )}
                                  , não (só) de {s.collectionName}. O jogo sorteia a saída proporcional a
                                  quantos dos 10 itens vieram de cada coleção — então parte real da chance
                                  (marcada como "outra coleção" abaixo) sai de lá. Isso é esperado, não um
                                  erro: é a troca que faz o float ficar mais barato de atingir — quanto mais
                                  coleções misturadas, maior o risco, mas às vezes o retorno também.
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
                                  Comprar exatamente isso (o link abre a página da arma+skin — marque
                                  StatTrak™ e o wear na página antes de comprar, o link não escolhe
                                  sozinho):
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
                                    {l.count}x {l.isSouvenir && "Lembrança "}
                                    {l.skinName} ({l.wear}) — {fmtBRL(l.unitPriceBrl)} cada
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
                                {calcOpenIdx === idx ? "Fechar calculadora de float" : "Calculadora de float"}
                              </button>
                              {calcOpenIdx === idx && (
                                <FloatCalculator
                                  outcomes={s.outcomes}
                                  legs={s.legs.map((l) => ({
                                    count: l.count,
                                    floatRange: l.floatRange,
                                    wearRange: l.wearFloatRange,
                                    label: `${l.count}x ${l.isSouvenir ? "Lembrança " : ""}${l.skinName} (${l.wear})`,
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
                                      ({wearLabel(o)})
                                    </span>
                                    {o.fromCollectionTag !== s.collectionTag && (
                                      <span style={{ color: COLORS.rust, fontSize: 10 }}>
                                        outra coleção ({s.legs.find((l) => l.collectionTag === o.fromCollectionTag)?.collectionName})
                                      </span>
                                    )}
                                    {o.marketHashName && (
                                      <a
                                        href={steamMarketUrl(o.marketHashName)}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ color: COLORS.gold, display: "flex", alignItems: "center" }}
                                        title="Abrir a saída no mercado — confira o preço e a liquidez real antes de decidir. A Steam pede pra marcar StatTrak™ e o wear certo na própria página."
                                      >
                                        <ExternalLink size={11} />
                                      </a>
                                    )}
                                  </span>
                                  <span style={{ color: COLORS.textDim, whiteSpace: "nowrap" }}>
                                    {o.prob.toFixed(1)}% · mercado {fmtBRL(o.price)} → líquido {fmtBRL(o.netPrice)} · {o.minListings} anúncios
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
