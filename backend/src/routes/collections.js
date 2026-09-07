import { Router } from "express";
import { db } from "../db.js";
import { fetchAppFilters } from "../steamClient.js";
import { getUsdToBrlRate } from "../fx.js";
import { refreshCollectionItems } from "../collectionsService.js";
import { startSyncAll, getSyncAllStatus } from "../syncAllJob.js";
import { getCollectionOutcomeMenu } from "../tradeUpEngine.js";

export const collectionsRouter = Router();

collectionsRouter.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT tag, name, total_count, synced_at FROM collections ORDER BY name")
    .all();
  res.json(rows);
});

// Busca a lista de coleções existentes no CS2 direto do Steam (1 request).
collectionsRouter.post("/sync", async (req, res) => {
  try {
    const collections = await fetchAppFilters();
    const upsert = db.prepare(`
      INSERT INTO collections (tag, name) VALUES (@tag, @name)
      ON CONFLICT(tag) DO UPDATE SET name = excluded.name
    `);
    for (const c of collections) upsert.run(c);
    res.json({ count: collections.length });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Dispara em background o refresh de TODAS as coleções, uma de cada vez,
// respeitando o intervalo mínimo do steamClient. Não bloqueia a resposta —
// consulte o progresso em GET /sync-all/status.
collectionsRouter.post("/sync-all", (req, res) => {
  const force = req.query.force === "1" || req.body?.force === true;
  const status = startSyncAll({ force });
  res.json(status);
});

collectionsRouter.get("/sync-all/status", (req, res) => {
  res.json(getSyncAllStatus());
});

collectionsRouter.post("/:tag/refresh", async (req, res) => {
  try {
    const result = await refreshCollectionItems(req.params.tag);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

collectionsRouter.get("/:tag/items", async (req, res) => {
  const currency = req.query.currency === "brl" ? "brl" : "usd";
  try {
    const rate = await getUsdToBrlRate(db);
    const rows = db
      .prepare(
        "SELECT * FROM items WHERE collection_tag = ? AND souvenir = 0 ORDER BY price_usd_cents DESC"
      )
      .all(req.params.tag);

    const items = rows.map((r) => ({
      ...r,
      stattrak: !!r.stattrak,
      souvenir: !!r.souvenir,
      special: !!r.special,
      priceUsd: r.price_usd_cents != null ? r.price_usd_cents / 100 : null,
      priceBrlEstimate: r.price_usd_cents != null ? (r.price_usd_cents / 100) * rate : null,
    }));

    const { byTier } = await getCollectionOutcomeMenu(req.params.tag, currency);

    res.json({ rate, currency, items, outcomeMenu: byTier });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
