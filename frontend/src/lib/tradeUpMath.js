import { COLORS } from "./colors";

// Preço do Mercado Steam é o que o comprador paga. Na revenda de item CS2,
// o vendedor recebe aproximadamente preço / 1,15 (taxas Steam + CS2).
export const STEAM_NET_SALE_FACTOR = 1 / 1.15;

export function computeStats(contract) {
  const totalProbRaw = contract.outcomes.reduce((s, o) => s + Number(o.prob || 0), 0) || 1;
  const grossEv = contract.outcomes.reduce(
    (s, o) => s + (Number(o.prob || 0) / totalProbRaw) * Number(o.price || 0),
    0
  );
  const ev = contract.outcomes.reduce(
    (s, o) => s + (Number(o.prob || 0) / totalProbRaw) * Number(o.netPrice ?? Number(o.price || 0) * STEAM_NET_SALE_FACTOR),
    0
  );
  const cost = Number(contract.cost || 0);
  const evProfit = ev - cost;
  const roi = cost > 0 ? (evProfit / cost) * 100 : 0;
  const probLoss =
    (contract.outcomes
      .filter((o) => Number(o.netPrice ?? Number(o.price || 0) * STEAM_NET_SALE_FACTOR) < cost)
      .reduce((s, o) => s + Number(o.prob || 0), 0) /
      totalProbRaw) *
    100;
  const best = contract.outcomes.reduce(
    (m, o) => (Number(o.price) > Number(m.price || -Infinity) ? o : m),
    {}
  );

  const netPrices = contract.outcomes.map((o) => Number(o.netPrice ?? Number(o.price || 0) * STEAM_NET_SALE_FACTOR));
  const bestCaseProfit = (netPrices.length ? Math.max(...netPrices) : 0) - cost;
  const worstCaseProfit = (netPrices.length ? Math.min(...netPrices) : 0) - cost;

  // "Quantos acertos em 10 tentativas pra não sair no prejuízo" — ver
  // comentário da mesma conta em backend/src/tradeUpEngine.js.
  const netOf = (o) => Number(o.netPrice ?? Number(o.price || 0) * STEAM_NET_SALE_FACTOR);
  const winOutcomes = contract.outcomes.filter((o) => netOf(o) - cost >= 0);
  const loseOutcomes = contract.outcomes.filter((o) => netOf(o) - cost < 0);
  const winProbSum = winOutcomes.reduce((s, o) => s + Number(o.prob || 0), 0);
  const loseProbSum = loseOutcomes.reduce((s, o) => s + Number(o.prob || 0), 0);
  const avgWinProfit =
    winProbSum > 0
      ? winOutcomes.reduce((s, o) => s + (Number(o.prob || 0) / winProbSum) * (netOf(o) - cost), 0)
      : null;
  const avgLossProfit =
    loseProbSum > 0
      ? loseOutcomes.reduce((s, o) => s + (Number(o.prob || 0) / loseProbSum) * (netOf(o) - cost), 0)
      : null;
  let breakEvenHits10 = null;
  if (avgWinProfit != null && avgWinProfit > 0) {
    breakEvenHits10 =
      avgLossProfit == null || avgLossProfit >= 0
        ? 0
        : Math.min(10, Math.max(0, Math.ceil((-10 * avgLossProfit) / (avgWinProfit - avgLossProfit) - 1e-9)));
  }

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
    grossEv,
    grossRoi: cost > 0 ? ((grossEv - cost) / cost) * 100 : 0,
    ev,
    evProfit,
    roi,
    bestCaseProfit,
    bestCaseRoi: cost > 0 ? (bestCaseProfit / cost) * 100 : 0,
    worstCaseProfit,
    worstCaseRoi: cost > 0 ? (worstCaseProfit / cost) * 100 : 0,
    avgWinProfit,
    avgLossProfit,
    breakEvenHits10,
    probLoss: Math.min(100, Math.max(0, probLoss)),
    verdict,
    verdictColor,
    best,
    probOff: Math.abs(totalProbRaw - 100) > 1,
    totalProbRaw,
  };
}

export function fmtBRL(n) {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtFloat(n) {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(3);
}
