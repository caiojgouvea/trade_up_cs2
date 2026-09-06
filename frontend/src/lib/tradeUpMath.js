import { COLORS } from "./colors";

export function computeStats(contract) {
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
