// O Steam não manda a raridade como texto padronizado, mas o "name_color"
// (cor da borda do item) é fixo por raridade — é o sinal mais confiável.
const COLOR_TO_RARITY = {
  b0c3d9: "Consumer Grade",
  "5e98d9": "Industrial Grade",
  "4b69ff": "Mil-Spec Grade",
  "8847ff": "Restricted",
  d32ce6: "Classified",
  eb4b4b: "Covert",
  e4ae39: "Contraband",
};

// Escada de trade-up: 10 de um tier viram 1 do próximo. Covert e Contraband
// são topo (não tem pra onde subir).
export const RARITY_ORDER = [
  "Consumer Grade",
  "Industrial Grade",
  "Mil-Spec Grade",
  "Restricted",
  "Classified",
  "Covert",
];

export function rarityFromNameColor(nameColor) {
  if (!nameColor) return null;
  return COLOR_TO_RARITY[nameColor.toLowerCase()] ?? null;
}
