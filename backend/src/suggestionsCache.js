import { db } from "./db.js";

export function getSuggestionCache(kind) {
  const row = db.prepare("SELECT * FROM suggestion_cache WHERE kind = ?").get(kind);
  if (!row) return null;
  return {
    computedAt: row.computed_at,
    minListings: row.min_listings,
    exhaustive: !!row.exhaustive,
    rate: row.rate,
    pricingVersion: row.pricing_version,
    suggestions: JSON.parse(row.payload),
  };
}

export function saveSuggestionCache(kind, { minListings, exhaustive, rate, suggestions }) {
  db.prepare(
    `INSERT INTO suggestion_cache (kind, computed_at, min_listings, exhaustive, rate, pricing_version, payload)
     VALUES (?, ?, ?, ?, ?, 'net-strict-v1', ?)
     ON CONFLICT(kind) DO UPDATE SET
       computed_at = excluded.computed_at,
       min_listings = excluded.min_listings,
       exhaustive = excluded.exhaustive,
       rate = excluded.rate,
       pricing_version = excluded.pricing_version,
       payload = excluded.payload`
  ).run(kind, new Date().toISOString(), minListings, exhaustive ? 1 : 0, rate, JSON.stringify(suggestions));
}
