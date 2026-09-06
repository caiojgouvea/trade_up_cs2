function loadSet(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    console.error("Falha ao carregar favoritos:", e);
    return new Set();
  }
}

function saveSet(key, set) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch (e) {
    console.error("Falha ao salvar favoritos:", e);
  }
}

export function loadFavorites() {
  return loadSet("trade-up-favorite-items");
}

export function saveFavorites(set) {
  saveSet("trade-up-favorite-items", set);
}

export function loadFavoriteSuggestions() {
  return loadSet("trade-up-favorite-suggestions");
}

export function saveFavoriteSuggestions(set) {
  saveSet("trade-up-favorite-suggestions", set);
}

export function suggestionKey(s) {
  return `${s.collectionTag}|${s.tier}|${s.nextTier}|${s.stattrak}`;
}

export function loadFavoriteManipulated() {
  return loadSet("trade-up-favorite-manipulated");
}

export function saveFavoriteManipulated(set) {
  saveSet("trade-up-favorite-manipulated", set);
}

export function manipulatedKey(s) {
  const legs = s.legs.map((l) => `${l.skinName}|${l.wear}|${l.count}`).join(",");
  return `${s.collectionTag}|${s.tier}|${s.nextTier}|${s.stattrak}|${legs}`;
}
