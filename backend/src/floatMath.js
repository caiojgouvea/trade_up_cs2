// Faixas padrão de wear do CS2. Uma skin específica pode não cobrir a faixa
// toda (ex: min/max float 0–0.08 nunca chega a Field-Tested) — por isso
// sempre recortamos pelo min/max real da skin antes de usar.
export const WEAR_BANDS = [
  { name: "Factory New", min: 0, max: 0.07 },
  { name: "Minimal Wear", min: 0.07, max: 0.15 },
  { name: "Field-Tested", min: 0.15, max: 0.38 },
  { name: "Well-Worn", min: 0.38, max: 0.45 },
  { name: "Battle-Scarred", min: 0.45, max: 1 },
];

export function clippedBands(skinMin, skinMax) {
  return WEAR_BANDS.map((b) => ({
    name: b.name,
    min: Math.max(b.min, skinMin),
    max: Math.min(b.max, skinMax),
  })).filter((b) => b.max > b.min);
}

// Fórmula oficial de trade-up: o float de saída é a média (bruta, 0–1) dos
// floats dos 10 inputs, mapeada proporcionalmente entre o min/max da skin de
// saída. Não é sorteio — é determinístico a partir do float médio de entrada.
export function outputFloatFromAvg(avgInputFloat, skinMin, skinMax) {
  return skinMin + avgInputFloat * (skinMax - skinMin);
}

// Inverso da fórmula acima: dado um float de saída desejado (ou faixa),
// qual float médio de entrada (bruto, 0–1) é necessário.
export function requiredAvgFloatForOutput(outputFloat, skinMin, skinMax) {
  if (skinMax === skinMin) return skinMin;
  return (outputFloat - skinMin) / (skinMax - skinMin);
}

export function requiredAvgFloatRange(skinMin, skinMax, targetMin, targetMax) {
  const a = requiredAvgFloatForOutput(targetMin, skinMin, skinMax);
  const b = requiredAvgFloatForOutput(targetMax, skinMin, skinMax);
  return {
    min: Math.max(0, Math.min(a, b)),
    max: Math.min(1, Math.max(a, b)),
  };
}

export function rangesOverlap(a, b) {
  return a.min <= b.max && b.min <= a.max;
}
