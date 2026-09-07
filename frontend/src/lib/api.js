const BASE = "/api";

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Erro ${res.status} ao chamar ${path}`);
  }
  return data;
}

export function getCollections() {
  return request("/collections");
}

export function syncCollections() {
  return request("/collections/sync", { method: "POST" });
}

export function refreshCollection(tag) {
  return request(`/collections/${encodeURIComponent(tag)}/refresh`, { method: "POST" });
}

export function getCollectionItems(tag) {
  return request(`/collections/${encodeURIComponent(tag)}/items`);
}

export function getExactPrice(marketHashName) {
  return request("/items/exact-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketHashName }),
  });
}

export function syncAllCollections(force = false) {
  return request(`/collections/sync-all${force ? "?force=1" : ""}`, { method: "POST" });
}

export function getSyncAllStatus() {
  return request("/collections/sync-all/status");
}

export function getSuggestions(minListings = 5) {
  return request(`/suggestions?minListings=${minListings}`);
}

export function getManipulatedSuggestions(minListings = 10) {
  return request(`/suggestions/manipulated?minListings=${minListings}`);
}

export function refreshManipulatedSuggestions(minListings = 10, exhaustive = false) {
  const params = new URLSearchParams({ minListings: String(minListings) });
  if (exhaustive) params.set("exhaustive", "1");
  return request(`/suggestions/manipulated/refresh?${params}`, { method: "POST" });
}

export function getManipulatedRefreshStatus() {
  return request("/suggestions/manipulated/refresh/status");
}

export function getSuggestionHistory({ sort = "roi", limit = 50, offset = 0, minRoi, minBestCaseRoi } = {}) {
  const params = new URLSearchParams({ sort, limit: String(limit), offset: String(offset) });
  if (minRoi !== undefined && minRoi !== "") params.set("minRoi", String(minRoi));
  if (minBestCaseRoi !== undefined && minBestCaseRoi !== "") params.set("minBestCaseRoi", String(minBestCaseRoi));
  return request(`/suggestions/manipulated/history?${params}`);
}
