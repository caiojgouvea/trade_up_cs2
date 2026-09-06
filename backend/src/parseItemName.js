const STAR_PREFIX = "★ ";
const STATTRAK_PREFIX = "StatTrak™ ";
const SOUVENIR_PREFIX = "Souvenir ";

// "StatTrak™ AK-47 | Inheritance (Battle-Scarred)" -> weapon/skin/exterior/flags
export function parseMarketHashName(hashName) {
  let name = hashName;
  let stattrak = false;
  let souvenir = false;
  let special = false;

  if (name.startsWith(STAR_PREFIX)) {
    special = true;
    name = name.slice(STAR_PREFIX.length);
  }
  if (name.startsWith(STATTRAK_PREFIX)) {
    stattrak = true;
    name = name.slice(STATTRAK_PREFIX.length);
  }
  if (name.startsWith(SOUVENIR_PREFIX)) {
    souvenir = true;
    name = name.slice(SOUVENIR_PREFIX.length);
  }

  let exterior = null;
  const extMatch = name.match(/\(([^)]+)\)\s*$/);
  if (extMatch) {
    exterior = extMatch[1];
    name = name.slice(0, extMatch.index).trim();
  }

  let weapon = name;
  let skin = null;
  const parts = name.split(" | ");
  if (parts.length === 2) {
    weapon = parts[0].trim();
    skin = parts[1].trim();
  }

  return { weapon, skin, exterior, stattrak, souvenir, special };
}
