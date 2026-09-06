// Paleta de EXIBIÇÃO (mais escura/saturada que as cores oficiais do Steam,
// que ficam parecidas demais entre si — principalmente Restricted x
// Classified — num contorno pequeno sobre fundo escuro). A DETECÇÃO da
// raridade continua usando as cores reais do Steam, em backend/src/rarity.js
// — esse arquivo aqui é só sobre como pintamos na tela.
export const RARITY_COLORS = {
  "Consumer Grade": "#94a3b8",
  "Industrial Grade": "#0ea5e9",
  "Mil-Spec Grade": "#2563eb",
  Restricted: "#7c3aed",
  Classified: "#db2777",
  Covert: "#dc2626",
  Contraband: "#b45309",
};

export function rarityColor(rarity, fallback = "#2a313c") {
  return RARITY_COLORS[rarity] ?? fallback;
}
