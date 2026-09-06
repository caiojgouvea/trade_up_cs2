import { db } from "./db.js";

// O Steam Market não informa min/max float por skin (isso é dado fixo do
// jogo, não da listagem). ByMykel/CSGO-API é um dataset comunitário estável
// gerado a partir dos arquivos do próprio CS2, usado por várias ferramentas
// de trade-up — é a fonte mais confiável sem precisar ler os arquivos do
// jogo localmente.
const SKINS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";

const upsertStmt = db.prepare(`
  INSERT INTO skin_floats (weapon, skin, min_float, max_float)
  VALUES (@weapon, @skin, @min_float, @max_float)
  ON CONFLICT(weapon, skin) DO UPDATE SET
    min_float = excluded.min_float,
    max_float = excluded.max_float
`);

export async function syncSkinFloats() {
  const res = await fetch(SKINS_URL);
  if (!res.ok) throw new Error(`Falha ao buscar dataset de floats (HTTP ${res.status})`);
  const data = await res.json();

  let count = 0;
  for (const s of data) {
    if (!s.pattern?.name || !s.weapon?.name) continue;
    if (typeof s.min_float !== "number" || typeof s.max_float !== "number") continue;
    upsertStmt.run({
      weapon: s.weapon.name,
      skin: s.pattern.name,
      min_float: s.min_float,
      max_float: s.max_float,
    });
    count++;
  }
  return { count };
}

export function getFloatRangeMap() {
  const rows = db.prepare("SELECT weapon, skin, min_float, max_float FROM skin_floats").all();
  const map = new Map();
  for (const r of rows) map.set(`${r.weapon}|${r.skin}`, { min: r.min_float, max: r.max_float });
  return map;
}

export function getSkinFloatsStatus() {
  const row = db.prepare("SELECT COUNT(*) AS count FROM skin_floats").get();
  return { count: row.count };
}
