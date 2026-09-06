// Espelho simplificado de backend/src/floatMath.js — aqui não precisamos
// recalcular as bandas (o backend já manda em outcome.wearPrices), só a
// fórmula de mapeamento e seu inverso.

export function outputFloatFromAvg(avgInputFloat, min, max) {
  return min + avgInputFloat * (max - min);
}

// Converte um float BRUTO (o número real que você vê inspecionando o item,
// ex: 0.028772375) pra posição RELATIVA (0–1) dentro da faixa própria da
// skin de entrada. A fórmula de trade-up usa essa posição relativa, não o
// float bruto — sem isso, uma skin de entrada cuja faixa não é 0–1 inteira
// (a maioria não é) dá uma média completamente errada.
export function normalizeFloat(rawFloat, min, max) {
  if (max === min) return 0;
  return (rawFloat - min) / (max - min);
}

// Inverso: de uma posição relativa (0–1) de volta pro float bruto daquela
// mesma skin de entrada.
export function denormalizeFloat(adjusted, min, max) {
  return min + adjusted * (max - min);
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
