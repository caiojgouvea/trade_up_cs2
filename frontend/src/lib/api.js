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
