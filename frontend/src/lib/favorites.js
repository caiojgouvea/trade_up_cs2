const KEY = "trade-up-favorite-items";

export function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    console.error("Falha ao carregar favoritos:", e);
    return new Set();
  }
}

export function saveFavorites(set) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch (e) {
    console.error("Falha ao salvar favoritos:", e);
  }
}
