// Espelho simplificado de backend/src/floatMath.js — aqui não precisamos
// recalcular as bandas (o backend já manda em outcome.wearPrices), só a
// fórmula de mapeamento e seu inverso.

export function outputFloatFromAvg(avgInputFloat, min, max) {
  return min + avgInputFloat * (max - min);
}

export function findBand(bands, floatValue) {
  return bands.find((b) => floatValue >= b.min && floatValue <= b.max) ?? null;
}

export function requiredAvgForBand(min, max, bandMin, bandMax) {
  if (max === min) return { min, max: min };
  const a = (bandMin - min) / (max - min);
  const b = (bandMax - min) / (max - min);
  return { min: Math.max(0, Math.min(a, b)), max: Math.min(1, Math.max(a, b)) };
}
