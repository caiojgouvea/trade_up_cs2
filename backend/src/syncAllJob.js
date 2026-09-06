import { db } from "./db.js";
import { refreshCollectionItems } from "./collectionsService.js";

const STALE_MS = 24 * 60 * 60 * 1000;

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  processed: 0,
  currentTag: null,
  currentName: null,
  errors: [],
};

export function getSyncAllStatus() {
  return { ...state, errors: state.errors.slice(-20) };
}

// Roda em background dentro do próprio processo do servidor: pega todas as
// coleções conhecidas (via /sync) e refaz o refresh de cada uma, uma por
// vez, respeitando o rate limit do steamClient. Como cada coleção já é uma
// sequência de vários requests espaçados, isso pode levar bastante tempo pro
// catálogo inteiro — por isso roda em segundo plano e não bloqueia a resposta.
export function startSyncAll({ force = false } = {}) {
  if (state.running) return getSyncAllStatus();

  const all = db.prepare("SELECT tag, name, synced_at FROM collections ORDER BY name").all();
  const pending = force
    ? all
    : all.filter((c) => !c.synced_at || Date.now() - new Date(c.synced_at).getTime() > STALE_MS);

  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.total = pending.length;
  state.processed = 0;
  state.currentTag = null;
  state.currentName = null;
  state.errors = [];

  (async () => {
    for (const c of pending) {
      state.currentTag = c.tag;
      state.currentName = c.name;
      try {
        await refreshCollectionItems(c.tag);
      } catch (e) {
        state.errors.push({ tag: c.tag, name: c.name, message: e.message });
      }
      state.processed += 1;
    }
    state.running = false;
    state.currentTag = null;
    state.currentName = null;
    state.finishedAt = new Date().toISOString();
  })();

  return getSyncAllStatus();
}
