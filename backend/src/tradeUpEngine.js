import { db } from "./db.js";
import { getUsdToBrlRate } from "./fx.js";
import { RARITY_ORDER } from "./rarity.js";
import { getFloatRangeMap } from "./floatData.js";
import { clippedBands, requiredAvgFloatRange, rangesOverlap } from "./floatMath.js";

// Mesma fórmula de src/lib/tradeUpMath.js do frontend — duplicada de
// propósito (é pouca lógica, e mantém backend/frontend independentes).
function computeContractStats(cost, outcomes) {
  const totalProbRaw = outcomes.reduce((s, o) => s + o.prob, 0) || 1;
  const ev = outcomes.reduce((s, o) => s + (o.prob / totalProbRaw) * o.price, 0);
  const evProfit = ev - cost;
  const roi = cost > 0 ? (evProfit / cost) * 100 : 0;
  const probLoss =
    (outcomes.filter((o) => o.price < cost).reduce((s, o) => s + o.prob, 0) / totalProbRaw) * 100;

  let verdict;
  if (roi > 15 && probLoss < 40) verdict = "Bom contrato";
  else if (roi > 0) verdict = "Arriscado";
  else verdict = "Furada";

  return { ev, evProfit, roi, probLoss: Math.min(100, Math.max(0, probLoss)), verdict };
}

// Junta itens (linhas por wear) em "skins" (agrupando os wears), pra ter um
// preço representativo por skin e a raridade/coleção/stattrak como chave.
// Também gruda o min/max float da skin (quando conhecido) e as bandas de
// wear já recortadas por esse min/max.
function groupIntoSkins(rows, floatMap) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.collection_tag}|${r.rarity}|${r.stattrak}|${r.weapon}|${r.skin}`;
    if (!groups.has(key)) {
      groups.set(key, {
        collectionTag: r.collection_tag,
        rarity: r.rarity,
        stattrak: !!r.stattrak,
        weapon: r.weapon,
        skin: r.skin,
        iconUrl: r.icon_url,
        wears: [],
      });
    }
    groups.get(key).wears.push({
      exterior: r.exterior,
      priceUsdCents: r.price_usd_cents,
      sellListings: r.sell_listings ?? 0,
    });
  }

  return [...groups.values()].map((g) => {
    const priced = g.wears.filter((w) => w.priceUsdCents != null);
    const avgUsdCents = priced.length
      ? priced.reduce((s, w) => s + w.priceUsdCents, 0) / priced.length
      : null;
    const minListings = g.wears.length
      ? Math.min(...g.wears.map((w) => w.sellListings))
      : 0;
    const floatRange = floatMap.get(`${g.weapon}|${g.skin}`) ?? null;
    const bands = floatRange ? clippedBands(floatRange.min, floatRange.max) : [];
    return { ...g, avgUsdCents, minListings, wearCount: g.wears.length, floatRange, bands };
  });
}

function cheapestPricedWear(skinGroup) {
  const priced = skinGroup.wears.filter((w) => w.priceUsdCents != null);
  if (!priced.length) return null;
  return priced.reduce((min, w) => (w.priceUsdCents < min.priceUsdCents ? w : min));
}

function mostExpensivePricedWear(skinGroup) {
  const priced = skinGroup.wears.filter((w) => w.priceUsdCents != null);
  if (!priced.length) return null;
  return priced.reduce((max, w) => (w.priceUsdCents > max.priceUsdCents ? w : max));
}

function bandForWear(skinGroup, exterior) {
  return skinGroup.bands.find((b) => b.name === exterior) ?? null;
}

// Preço (em BRL) de cada banda de wear que a skin realmente alcança, pra
// alimentar a calculadora de float no front (mostrar quanto vale cada wear
// possível daquela saída específica, não só a média).
function wearPricesBrl(skinGroup, rate) {
  return skinGroup.bands.map((b) => {
    const wear = skinGroup.wears.find((w) => w.exterior === b.name);
    return {
      name: b.name,
      min: b.min,
      max: b.max,
      price: wear?.priceUsdCents != null ? (wear.priceUsdCents / 100) * rate : null,
    };
  });
}

// Info de float pro contrato: qual é a saída mais valiosa alcançável (skin +
// wear), o float médio de entrada necessário pra chegar nela (fórmula oficial
// de trade-up — o wear de saída é determinístico, não sorteado), e se o
// input mais barato já escolhido consegue alcançar essa faixa comprando o
// wear mais barato dele.
function computeFloatGuidance({ cheapestInput, outputs, rate }) {
  let best = null;
  for (const o of outputs) {
    const wear = mostExpensivePricedWear(o);
    if (!wear) continue;
    if (!best || wear.priceUsdCents > best.wear.priceUsdCents) {
      best = { skin: o, wear };
    }
  }
  if (!best || !best.skin.floatRange) return { available: false };

  const outBand = bandForWear(best.skin, best.wear.exterior);
  if (!outBand) return { available: false };

  const required = requiredAvgFloatRange(
    best.skin.floatRange.min,
    best.skin.floatRange.max,
    outBand.min,
    outBand.max
  );

  const inputWear = cheapestPricedWear(cheapestInput);
  let inputAchievable = null;
  let feasible = null;
  if (inputWear && cheapestInput.floatRange) {
    const inBand = bandForWear(cheapestInput, inputWear.exterior);
    if (inBand) {
      inputAchievable = { min: inBand.min, max: inBand.max };
      feasible = rangesOverlap(inputAchievable, required);
    }
  }

  return {
    available: true,
    bestOutcomeName: `${best.skin.weapon} | ${best.skin.skin}`,
    bestOutcomeWear: best.wear.exterior,
    bestOutcomePrice: (best.wear.priceUsdCents / 100) * rate,
    requiredAvgFloatMin: required.min,
    requiredAvgFloatMax: required.max,
    inputWear: inputWear?.exterior ?? null,
    inputAchievableFloatMin: inputAchievable?.min ?? null,
    inputAchievableFloatMax: inputAchievable?.max ?? null,
    feasibleWithCheapestInput: feasible,
  };
}

// Gera sugestões de trade-up de UMA coleção só (o tipo clássico: 10 skins da
// mesma coleção e raridade). Trade-ups misturando coleções ficam pra uma
// próxima etapa (o espaço de busca cresce muito mais).
export async function computeSingleCollectionSuggestions({ minListings = 5 } = {}) {
  const rate = await getUsdToBrlRate(db);
  const floatMap = getFloatRangeMap();

  const rows = db
    .prepare(
      `SELECT collection_tag, rarity, stattrak, weapon, skin, exterior, icon_url, price_usd_cents, sell_listings
       FROM items
       WHERE commodity = 0
         AND exterior IS NOT NULL
         AND special = 0
         AND souvenir = 0
         AND rarity IS NOT NULL
         AND price_usd_cents IS NOT NULL`
    )
    .all();

  const skins = groupIntoSkins(rows, floatMap);

  const collectionNames = new Map(
    db.prepare("SELECT tag, name FROM collections").all().map((c) => [c.tag, c.name])
  );

  // menu[collectionTag][rarity][stattrak ? 1 : 0] = [skins...]
  const menu = new Map();
  for (const s of skins) {
    if (s.avgUsdCents == null) continue;
    const st = s.stattrak ? 1 : 0;
    if (!menu.has(s.collectionTag)) menu.set(s.collectionTag, new Map());
    const byRarity = menu.get(s.collectionTag);
    if (!byRarity.has(s.rarity)) byRarity.set(s.rarity, { 0: [], 1: [] });
    byRarity.get(s.rarity)[st].push(s);
  }

  const suggestions = [];

  for (const [collectionTag, byRarity] of menu) {
    for (let i = 0; i < RARITY_ORDER.length - 1; i++) {
      const tier = RARITY_ORDER[i];
      const nextTier = RARITY_ORDER[i + 1];
      const tierMenu = byRarity.get(tier);
      const nextMenu = byRarity.get(nextTier);
      if (!tierMenu || !nextMenu) continue;

      for (const stattrak of [0, 1]) {
        const inputs = tierMenu[stattrak];
        const outputs = nextMenu[stattrak];
        if (!inputs?.length || !outputs?.length) continue;

        const liquidInputs = inputs.filter((s) => s.minListings >= minListings);
        const inputPool = liquidInputs.length ? liquidInputs : inputs;
        const cheapestInput = inputPool.reduce((min, s) =>
          s.avgUsdCents < min.avgUsdCents ? s : min
        );

        const costBrl = ((cheapestInput.avgUsdCents / 100) * rate) * 10;
        const outcomes = outputs.map((o) => ({
          name: `${o.weapon} | ${o.skin}${stattrak ? " (StatTrak™)" : ""}`,
          prob: 100 / outputs.length,
          price: (o.avgUsdCents / 100) * rate,
          minListings: o.minListings,
          iconUrl: o.iconUrl,
          floatRange: o.floatRange,
          wearPrices: wearPricesBrl(o, rate),
        }));

        const stats = computeContractStats(costBrl, outcomes);
        if (!Number.isFinite(stats.roi)) continue;

        const floatInfo = computeFloatGuidance({ cheapestInput, outputs, rate });

        suggestions.push({
          collectionTag,
          collectionName: collectionNames.get(collectionTag) ?? collectionTag,
          tier,
          nextTier,
          stattrak: !!stattrak,
          inputSkin: `${cheapestInput.weapon} | ${cheapestInput.skin}`,
          inputIconUrl: cheapestInput.iconUrl,
          inputListings: cheapestInput.minListings,
          inputLiquidityWarning: !liquidInputs.length,
          cost: costBrl,
          outcomeCount: outcomes.length,
          minOutputListings: Math.min(...outcomes.map((o) => o.minListings)),
          outcomes,
          stats,
          floatInfo,
        });
      }
    }
  }

  suggestions.sort((a, b) => b.stats.roi - a.stats.roi);
  return { rate, suggestions };
}

// Pra cada raridade (exceto a última) dentro de UMA coleção, devolve as
// possíveis saídas de trade-up (raridade seguinte, mesma coleção, mesmo
// stattrak). Usado pra mostrar "isso aqui pode virar X, Y, Z" item a item na
// listagem de preços — ao contrário de computeSingleCollectionSuggestions,
// não escolhe um input mais barato: quem chama decide o custo (o preço do
// item específico da linha).
export async function getCollectionOutcomeMenu(collectionTag) {
  const rate = await getUsdToBrlRate(db);
  const floatMap = getFloatRangeMap();

  const rows = db
    .prepare(
      `SELECT collection_tag, rarity, stattrak, weapon, skin, exterior, icon_url, price_usd_cents, sell_listings
       FROM items
       WHERE collection_tag = ?
         AND commodity = 0
         AND exterior IS NOT NULL
         AND special = 0
         AND souvenir = 0
         AND rarity IS NOT NULL
         AND price_usd_cents IS NOT NULL`
    )
    .all(collectionTag);

  const skins = groupIntoSkins(rows, floatMap).filter((s) => s.avgUsdCents != null);

  const byRarity = new Map();
  for (const s of skins) {
    const st = s.stattrak ? 1 : 0;
    if (!byRarity.has(s.rarity)) byRarity.set(s.rarity, { 0: [], 1: [] });
    byRarity.get(s.rarity)[st].push(s);
  }

  const byTier = {};
  for (let i = 0; i < RARITY_ORDER.length - 1; i++) {
    const tier = RARITY_ORDER[i];
    const nextTier = RARITY_ORDER[i + 1];
    const nextMenu = byRarity.get(nextTier);
    if (!nextMenu) continue;

    const toOutcomes = (outputs) =>
      outputs.map((o) => ({
        name: `${o.weapon} | ${o.skin}`,
        prob: 100 / outputs.length,
        price: (o.avgUsdCents / 100) * rate,
        minListings: o.minListings,
        iconUrl: o.iconUrl,
        floatRange: o.floatRange,
        wearPrices: wearPricesBrl(o, rate),
      }));

    // Pra essa coluna a gente não tem "o input mais barato" — quem chama
    // decide. Mas dá pra mostrar a mesma info de "melhor saída alcançável"
    // olhando só pros outputs; a viabilidade contra o float do input
    // específico fica pro chamador (ele conhece o item real da linha).
    const bestPerSide = (outputs) => {
      let best = null;
      for (const o of outputs) {
        const wear = mostExpensivePricedWear(o);
        if (!wear) continue;
        if (!best || wear.priceUsdCents > best.wear.priceUsdCents) best = { skin: o, wear };
      }
      if (!best || !best.skin.floatRange) return null;
      const band = bandForWear(best.skin, best.wear.exterior);
      if (!band) return null;
      const required = requiredAvgFloatRange(
        best.skin.floatRange.min,
        best.skin.floatRange.max,
        band.min,
        band.max
      );
      return {
        name: `${best.skin.weapon} | ${best.skin.skin}`,
        wear: best.wear.exterior,
        price: (best.wear.priceUsdCents / 100) * rate,
        requiredAvgFloatMin: required.min,
        requiredAvgFloatMax: required.max,
      };
    };

    byTier[tier] = {
      nextTier,
      normal: nextMenu[0].length ? toOutcomes(nextMenu[0]) : [],
      stattrak: nextMenu[1].length ? toOutcomes(nextMenu[1]) : [],
      bestOutcomeNormal: nextMenu[0].length ? bestPerSide(nextMenu[0]) : null,
      bestOutcomeStattrak: nextMenu[1].length ? bestPerSide(nextMenu[1]) : null,
    };
  }

  return { rate, byTier };
}
