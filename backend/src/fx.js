const FX_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function getMeta(db, key) {
  return db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
}

function setMeta(db, key, value) {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ key, value });
}

// Taxa USD->BRL cacheada no SQLite por CACHE_TTL_MS, pra não bater na API de
// câmbio a cada request. Se a API falhar, cai pro último valor conhecido.
export async function getUsdToBrlRate(db) {
  const cachedRate = getMeta(db, "usd_brl_rate");
  const updatedAt = getMeta(db, "usd_brl_rate_updated_at");
  const isFresh = updatedAt && Date.now() - new Date(updatedAt).getTime() < CACHE_TTL_MS;

  if (cachedRate && isFresh) return Number(cachedRate);

  try {
    const res = await fetch(FX_URL);
    if (!res.ok) throw new Error(`Câmbio respondeu ${res.status}`);
    const data = await res.json();
    const rate = data.rates.BRL;
    setMeta(db, "usd_brl_rate", String(rate));
    setMeta(db, "usd_brl_rate_updated_at", new Date().toISOString());
    return rate;
  } catch (e) {
    if (cachedRate) return Number(cachedRate);
    throw e;
  }
}
