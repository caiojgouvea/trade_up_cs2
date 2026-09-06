import { db } from "./db.js";
import { fetchCollectionPage } from "./steamClient.js";
import { parseMarketHashName } from "./parseItemName.js";
import { rarityFromNameColor } from "./rarity.js";

const upsertItemStmt = db.prepare(`
  INSERT INTO items (
    market_hash_name, collection_tag, weapon, skin, exterior,
    stattrak, souvenir, special, rarity, commodity, item_type, icon_url,
    sell_listings, price_usd_cents, fetched_at
  ) VALUES (
    @market_hash_name, @collection_tag, @weapon, @skin, @exterior,
    @stattrak, @souvenir, @special, @rarity, @commodity, @item_type, @icon_url,
    @sell_listings, @price_usd_cents, @fetched_at
  )
  ON CONFLICT(market_hash_name) DO UPDATE SET
    weapon = excluded.weapon,
    skin = excluded.skin,
    exterior = excluded.exterior,
    stattrak = excluded.stattrak,
    souvenir = excluded.souvenir,
    special = excluded.special,
    rarity = excluded.rarity,
    commodity = excluded.commodity,
    item_type = excluded.item_type,
    icon_url = excluded.icon_url,
    sell_listings = excluded.sell_listings,
    price_usd_cents = excluded.price_usd_cents,
    fetched_at = excluded.fetched_at
`);

// Pagina o Steam Market inteiro filtrado por uma coleção e grava/atualiza os
// itens no SQLite. O Steam limita requests anônimos a 10 itens por página
// (ver steamClient.js), então isso é uma sequência de vários requests
// espaçados — pode levar de segundos a minutos por coleção grande. Cada
// página já é gravada assim que chega, então se o request de uma página no
// meio do caminho falhar (ex: 429 persistente), o que já foi buscado não se
// perde — só essa coleção fica sem synced_at e é retentada na próxima
// sync-all.
export async function refreshCollectionItems(tag) {
  const exists = db.prepare("SELECT 1 FROM collections WHERE tag = ?").get(tag);
  if (!exists) throw new Error(`Coleção desconhecida: ${tag}. Rode /sync primeiro.`);

  let start = 0;
  let total = Infinity;
  let itemCount = 0;
  const now = () => new Date().toISOString();

  while (start < total) {
    const page = await fetchCollectionPage(tag, start, 100);
    total = page.total_count;
    if (!page.results || page.results.length === 0) break;

    for (const r of page.results) {
      const desc = r.asset_description || {};
      const parsed = parseMarketHashName(r.hash_name);
      upsertItemStmt.run({
        market_hash_name: r.hash_name,
        collection_tag: tag,
        weapon: parsed.weapon,
        skin: parsed.skin,
        exterior: parsed.exterior,
        stattrak: parsed.stattrak ? 1 : 0,
        souvenir: parsed.souvenir ? 1 : 0,
        special: parsed.special ? 1 : 0,
        rarity: rarityFromNameColor(desc.name_color),
        commodity: desc.commodity ?? null,
        item_type: desc.type ?? null,
        icon_url: desc.icon_url ?? null,
        sell_listings: r.sell_listings ?? null,
        price_usd_cents: r.sell_price ?? null,
        fetched_at: now(),
      });
      itemCount += 1;
    }
    start += page.results.length;
  }

  db.prepare("UPDATE collections SET total_count = ?, synced_at = ? WHERE tag = ?").run(
    total,
    now(),
    tag
  );

  return { tag, itemCount, totalReported: total };
}
