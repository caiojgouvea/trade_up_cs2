import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "prices.db"));

// WAL: permite a worker thread do recálculo de sugestões manipuladas (que
// pode rodar por horas no modo exaustivo) ler o banco numa conexão própria
// sem travar o processo principal, e vice-versa.
db.exec("PRAGMA journal_mode = WAL;");

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

  -- Último resultado calculado de cada tipo de sugestão (só guarda o mais
  -- recente, não histórico). O cálculo em si roda numa worker thread à
  -- parte (ver manipulatedJob.js) e escreve aqui quando termina; as rotas
  -- da API só leem daqui, então servir a sugestão é instantâneo mesmo que o
  -- cálculo mais recente tenha levado horas.
  CREATE TABLE IF NOT EXISTS suggestion_cache (
    kind TEXT PRIMARY KEY,
    computed_at TEXT NOT NULL,
    min_listings INTEGER NOT NULL,
    exhaustive INTEGER NOT NULL DEFAULT 0,
    rate REAL NOT NULL,
    pricing_version TEXT NOT NULL DEFAULT 'legacy',
    payload TEXT NOT NULL
  );

  -- Log permanente (append-only) de todo contrato que já apareceu num
  -- cálculo de "manipulados" — ao contrário de suggestion_cache (que só
  -- guarda a última rodada), isso NUNCA é sobrescrito: cada rodada manual
  -- ou exaustiva soma linhas novas, então um achado bom continua registrado
  -- mesmo que o preço mude e ele suma da rodada seguinte.
  CREATE TABLE IF NOT EXISTS suggestion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    computed_at TEXT NOT NULL,
    exhaustive INTEGER NOT NULL DEFAULT 0,
    collection_tag TEXT,
    collection_name TEXT,
    tier TEXT,
    next_tier TEXT,
    stattrak INTEGER NOT NULL DEFAULT 0,
    cross_collection INTEGER NOT NULL DEFAULT 0,
    leg_count INTEGER,
    cost REAL,
    roi REAL,
    best_case_roi REAL,
    worst_case_roi REAL,
    prob_loss REAL,
    verdict TEXT,
    payload TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_suggestion_history_roi ON suggestion_history(roi DESC);
  CREATE INDEX IF NOT EXISTS idx_suggestion_history_best ON suggestion_history(best_case_roi DESC);
  CREATE INDEX IF NOT EXISTS idx_suggestion_history_computed_at ON suggestion_history(computed_at DESC);
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

const cacheColumns = new Set(
  db.prepare("PRAGMA table_info(suggestion_cache)").all().map((c) => c.name)
);
if (!cacheColumns.has("pricing_version")) {
  db.exec("ALTER TABLE suggestion_cache ADD COLUMN pricing_version TEXT NOT NULL DEFAULT 'legacy'");
}
if (!cacheColumns.has("currency")) {
  db.exec("ALTER TABLE suggestion_cache ADD COLUMN currency TEXT NOT NULL DEFAULT 'brl'");
}
