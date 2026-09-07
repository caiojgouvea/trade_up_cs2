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
    probLoss: Math.min(100, Math.max(0, probLoss)),
    verdict,
    verdictColor,
    best,
    probOff: Math.abs(totalProbRaw - 100) > 1,
    totalProbRaw,
  };
}

export function fmtBRL(n) {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtFloat(n) {
  if (!isFinite(n)) return "—";
  return n.toFixed(3);
}
