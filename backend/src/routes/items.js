import { Router } from "express";
import { db } from "../db.js";
import { fetchExactPriceBRL } from "../steamClient.js";

export const itemsRouter = Router();

// Preço exato em BRL (via priceoverview) de UM item, sob demanda — não usar
// em massa, é 1 request por item e o Steam bloqueia rápido se abusar.
itemsRouter.post("/exact-price", async (req, res) => {
  const { marketHashName } = req.body || {};
  if (!marketHashName) {
    return res.status(400).json({ error: "marketHashName é obrigatório" });
  }

  try {
    const exact = await fetchExactPriceBRL(marketHashName);
    if (exact) {
      db.prepare(
        `UPDATE items SET price_brl_exact = ?, price_brl_exact_fetched_at = ? WHERE market_hash_name = ?`
      ).run(exact.lowestPrice, new Date().toISOString(), marketHashName);
    }
    res.json(exact);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
