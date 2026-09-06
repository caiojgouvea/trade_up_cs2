import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "prices.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    tag TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    total_count INTEGER,
    synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS items (
    market_hash_name TEXT PRIMARY KEY,
    collection_tag TEXT NOT NULL,
    weapon TEXT,
    skin TEXT,
    exterior TEXT,
    stattrak INTEGER NOT NULL DEFAULT 0,
    souvenir INTEGER NOT NULL DEFAULT 0,
    sell_listings INTEGER,
    price_usd_cents INTEGER,
    price_brl_exact REAL,
    price_brl_exact_fetched_at TEXT,
    fetched_at TEXT,
    FOREIGN KEY (collection_tag) REFERENCES collections(tag)
  );

  CREATE INDEX IF NOT EXISTS idx_items_collection ON items(collection_tag);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS skin_floats (
    weapon TEXT NOT NULL,
    skin TEXT NOT NULL,
    min_float REAL NOT NULL,
    max_float REAL NOT NULL,
    PRIMARY KEY (weapon, skin)
  );
`);

// Migração idempotente pra bases já criadas antes destas colunas existirem.
const existingColumns = new Set(
  db.prepare("PRAGMA table_info(items)").all().map((c) => c.name)
);
const migrations = [
  ["rarity", "ALTER TABLE items ADD COLUMN rarity TEXT"],
  ["special", "ALTER TABLE items ADD COLUMN special INTEGER NOT NULL DEFAULT 0"],
  ["commodity", "ALTER TABLE items ADD COLUMN commodity INTEGER"],
  ["item_type", "ALTER TABLE items ADD COLUMN item_type TEXT"],
  ["icon_url", "ALTER TABLE items ADD COLUMN icon_url TEXT"],
];
for (const [column, sql] of migrations) {
  if (!existingColumns.has(column)) db.exec(sql);
}
