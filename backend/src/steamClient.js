const STEAM_BASE = "https://steamcommunity.com/market";
// O Steam bloqueia rápido em rajada contínua (confirmado na prática: ~metade
// dos requests toma 429 com um intervalo de 800ms mantido por muitos
// requests seguidos). 2s de intervalo + backoff longo é mais lento mas
// aguenta uma sincronização de catálogo inteiro sem cair.
const MIN_INTERVAL_MS = 2000;
const RETRY_DELAYS_MS = [15000, 30000, 60000];
const USER_AGENT = "trade-up-cs2-local/0.1 (personal price lookup tool)";

let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttledFetchJson(url) {
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 429) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw new Error(`Steam Market respondeu 429 repetidamente para ${url}`);
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Steam Market respondeu ${res.status} para ${url}`);
    }
    return res.json();
  }
}

// Retorna [{ tag, name }] a partir da faceta "Collection" (730_ItemSet) do market.
export async function fetchAppFilters() {
  const data = await throttledFetchJson(`${STEAM_BASE}/appfilters/730`);
  const facet = data.facets?.["730_ItemSet"];
  if (!facet) return [];
  return Object.entries(facet.tags).map(([tag, info]) => ({
    tag,
    name: info.localized_name,
  }));
}

// Uma página de itens de uma coleção. O preço vindo daqui é sempre em USD
// (o parâmetro currency é ignorado por este endpoint sem sessão logada).
export async function fetchCollectionPage(tag, start, count = 100) {
  const params = new URLSearchParams({
    query: "",
    start: String(start),
    count: String(count),
    search_descriptions: "0",
    sort_column: "name",
    sort_dir: "asc",
    appid: "730",
    norender: "1",
  });
  params.append("category_730_ItemSet[]", `tag_${tag}`);
  return throttledFetchJson(`${STEAM_BASE}/search/render/?${params.toString()}`);
}

function parseBRL(text) {
  const cleaned = text.replace(/[^\d,.-]/g, "").replace(",", ".");
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

// Preço exato em BRL de UM item (respeita currency, mas é 1 request por item —
// usar sob demanda, não em massa).
export async function fetchExactPriceBRL(marketHashName) {
  const params = new URLSearchParams({
    appid: "730",
    currency: "7",
    market_hash_name: marketHashName,
  });
  const data = await throttledFetchJson(`${STEAM_BASE}/priceoverview/?${params.toString()}`);
  if (!data.success) return null;
  return {
    lowestPrice: data.lowest_price ? parseBRL(data.lowest_price) : null,
    medianPrice: data.median_price ? parseBRL(data.median_price) : null,
    volume: data.volume ? Number(String(data.volume).replace(/\D/g, "")) : null,
  };
}
