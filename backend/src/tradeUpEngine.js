import { db } from "./db.js";
import { getUsdToBrlRate } from "./fx.js";
import { RARITY_ORDER } from "./rarity.js";
import { getFloatRangeMap } from "./floatData.js";
import { clippedBands, requiredAvgFloatRange, rangesOverlap, outputFloatFromAvg } from "./floatMath.js";

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

function bandForFloat(skinGroup, floatValue) {
  return skinGroup.bands.find((b) => floatValue >= b.min && floatValue <= b.max) ?? null;
}

function priceForWear(skinGroup, exterior) {
  return skinGroup.wears.find((w) => w.exterior === exterior)?.priceUsdCents ?? null;
}

// Quando o wear previsto não tem preço confiável, o vizinho mais próximo (por
// faixa de float) é uma estimativa bem menos enviesada que a média de todos
// os wears — que normalmente inclui Factory New, puxando pra cima demais se
// o wear real que sairia for um dos mais gastos (o caso mais comum).
function nearestPricedBand(skinGroup, targetBand) {
  const targetMid = (targetBand.min + targetBand.max) / 2;
  let best = null;
  let bestDist = Infinity;
  for (const b of skinGroup.bands) {
    const cents = priceForWear(skinGroup, b.name);
    if (cents == null) continue;
    const mid = (b.min + b.max) / 2;
    const dist = Math.abs(mid - targetMid);
    if (dist < bestDist) {
      bestDist = dist;
      best = { name: b.name, priceUsdCents: cents };
    }
  }
  return best;
}

// O ponto central da correção: o wear de saída NÃO é sorteado, é
// determinístico a partir da média de float de entrada. Dado o float médio
// assumido (baseado no wear real que você compraria), prevê exatamente qual
// wear cada possível skin de saída teria — e usa o preço REAL desse wear, não
// uma média entre todos os wears. Só cai pra média se faltar dado de float
// (pra skin de saída, ou pro input) ou se o wear previsto não tiver preço.
function predictOutcomePrice(outputSkin, assumedAvgFloat, rate) {
  let predictedWear = null;
  let targetBand = null;

  if (assumedAvgFloat != null && outputSkin.floatRange) {
    const predictedFloat = outputFloatFromAvg(
      assumedAvgFloat,
      outputSkin.floatRange.min,
      outputSkin.floatRange.max
    );
    targetBand = bandForFloat(outputSkin, predictedFloat);
    if (targetBand) {
      predictedWear = targetBand.name;
      const cents = priceForWear(outputSkin, targetBand.name);
      if (cents != null) {
        return { price: (cents / 100) * rate, wear: targetBand.name, predicted: true, priceIsEstimate: false };
      }
    }
  }

  // Sabemos qual wear sairia (o float é determinístico), mas esse wear
  // específico não tem anúncio suficiente pra confiar num preço dele. Usa o
  // preço do wear vizinho mais próximo como estimativa (bem menos enviesado
  // que a média de todos os wears, que normalmente inclui Factory New e
  // puxaria a estimativa pra cima se o wear real for um dos mais gastos).
  if (targetBand) {
    const neighbor = nearestPricedBand(outputSkin, targetBand);
    if (neighbor) {
      return {
        price: (neighbor.priceUsdCents / 100) * rate,
        wear: predictedWear,
        predicted: false,
        priceIsEstimate: true,
      };
    }
  }

  return outputSkin.avgUsdCents != null
    ? { price: (outputSkin.avgUsdCents / 100) * rate, wear: predictedWear, predicted: false, priceIsEstimate: true }
    : { price: null, wear: predictedWear, predicted: false, priceIsEstimate: true };
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
    bestOutcomeName: `${best.skin.weapon} | ${best.skin.skin}${best.skin.stattrak ? " (StatTrak™)" : ""}`,
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

// O Steam Market agrupa por tag de busca, e nem toda tag é uma Coleção de
// verdade do jogo (com uma escada de raridade coesa pra trade-up). Além das
// ~93 "The X Collection" reais, existem tags tipo "Broken Fang Agents"
// (agentes, nem têm float) e "Limited Edition Item" (um bucket genérico pra
// skins promocionais avulsas que NÃO necessariamente compartilham a mesma
// coleção real — testado manualmente: mistura AK-47 Aphrodite, M4A1-S
// Solitude, Desert Eagle Heat Treated e XM1014 Solitude, que não têm
// garantia nenhuma de dar trade-up entre si no jogo). Sugestão só faz
// sentido pra coleções que seguem o nome padrão oficial.
const REAL_COLLECTION_FILTER = "collection_tag IN (SELECT tag FROM collections WHERE name LIKE 'The % Collection')";

// Monta o menu compartilhado por computeSingleCollectionSuggestions e
// computeManipulatedSuggestions: pra cada coleção/raridade/stattrak, as
// skins disponíveis (já agrupadas por wear) com liquidez suficiente.
//
// minListings é um piso RÍGIDO, não uma preferência: um wear com menos
// anúncios ativos que isso não entra na conta nem como entrada nem como
// saída. Motivo duplo — (1) pra entrada, você literalmente não consegue
// comprar 10 unidades se não tem 10+ anunciadas; (2) pro preço em si, com
// pouquíssimos anúncios o "menor preço" do Steam não é confiável (pode ser
// um vendedor patinho fora da curva), e ROIs de centenas de % baseados
// nisso já apareceram na prática usando só 2 anúncios.
async function buildInputMenu(minListings) {
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
         AND price_usd_cents IS NOT NULL
         AND ${REAL_COLLECTION_FILTER}`
    )
    .all()
    .filter((r) => (r.sell_listings ?? 0) >= minListings);

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

  return { rate, menu, collectionNames };
}

// Gera sugestões de trade-up de UMA coleção só (o tipo clássico: 10 skins da
// mesma coleção e raridade). Trade-ups misturando coleções ficam pra uma
// próxima etapa (o espaço de busca cresce muito mais).
export async function computeSingleCollectionSuggestions({ minListings = 10 } = {}) {
  const { rate, menu, collectionNames } = await buildInputMenu(minListings);

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

        // Unidades realmente compráveis: cada skin+wear específico com
        // preço, não a média da skin (você não compra "a média"). Já vêm só
        // com liquidez suficiente, porque `rows` já foi filtrado acima.
        const inputUnits = [];
        for (const s of inputs) {
          for (const w of s.wears) {
            if (w.priceUsdCents == null) continue;
            inputUnits.push({ skin: s, wear: w });
          }
        }
        if (!inputUnits.length) continue;

        const cheapestUnit = inputUnits.reduce((min, u) =>
          u.wear.priceUsdCents < min.wear.priceUsdCents ? u : min
        );

        const costBrl = (cheapestUnit.wear.priceUsdCents / 100) * rate * 10;

        // Float médio assumido = meio da faixa do wear que você realmente
        // compraria (a entrada mais barata). Sem isso, cai pro método antigo
        // (média entre wears) só pra essa skin de entrada específica.
        let assumedAvgFloat = null;
        if (cheapestUnit.skin.floatRange) {
          const inBand = bandForWear(cheapestUnit.skin, cheapestUnit.wear.exterior);
          if (inBand) assumedAvgFloat = (inBand.min + inBand.max) / 2;
        }

        const outcomes = outputs
          .map((o) => {
            const predicted = predictOutcomePrice(o, assumedAvgFloat, rate);
            return {
              name: `${o.weapon} | ${o.skin}${stattrak ? " (StatTrak™)" : ""}`,
              prob: 100 / outputs.length,
              price: predicted.price,
              predictedWear: predicted.wear,
              priceIsEstimate: predicted.priceIsEstimate,
              minListings: o.minListings,
              iconUrl: o.iconUrl,
              floatRange: o.floatRange,
              wearPrices: wearPricesBrl(o, rate),
            };
          })
          .filter((o) => o.price != null);
        if (!outcomes.length) continue;

        const stats = computeContractStats(costBrl, outcomes);
        if (!Number.isFinite(stats.roi)) continue;

        const floatInfo = computeFloatGuidance({ cheapestInput: cheapestUnit.skin, outputs, rate });

        suggestions.push({
          collectionTag,
          collectionName: collectionNames.get(collectionTag) ?? collectionTag,
          tier,
          nextTier,
          stattrak: !!stattrak,
          inputSkin: `${cheapestUnit.skin.weapon} | ${cheapestUnit.skin.skin}`,
          inputWear: cheapestUnit.wear.exterior,
          inputIconUrl: cheapestUnit.skin.iconUrl,
          inputListings: cheapestUnit.wear.sellListings,
          assumedAvgFloat,
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

// Float médio (meio da faixa de wear) de uma unidade compráveis específica
// (skin+wear). Usa a mesma aproximação já usada no resto do arquivo — não
// conhecemos o float exato de cada anúncio, só a faixa do wear.
function unitFloatMid(unit) {
  if (!unit.skin.floatRange) return null;
  const band = bandForWear(unit.skin, unit.wear.exterior);
  return band ? (band.min + band.max) / 2 : null;
}

// O "trade-up manipulado": em vez de comprar 10 unidades idênticas (a
// entrada mais barata disponível), mistura DUAS unidades diferentes — podem
// ser dois wears da mesma skin, ou skins diferentes da mesma
// raridade/coleção/stattrak — pra pilotar o float médio de entrada pra uma
// faixa mais barata de atingir do que qualquer skin/wear sozinho permite.
// O float de saída é determinístico (não sorteado), então empurrar o float
// médio pra cima ou pra baixo muda exatamente qual wear cada saída possível
// vai ter — e às vezes um wear mais barato de mirar custa bem menos que
// comprar 10 cópias do próprio input mais barato.
//
// Só considera misturas de até 2 unidades distintas: minimizar custo sujeito
// a "média de float = alvo" e "soma de unidades = 10" é um problema linear
// com 2 restrições, cujo ótimo contínuo sempre usa no máximo 2 variáveis
// básicas — misturar um 3º tipo nunca compensa. As contagens são inteiras de
// 1 a 9 pra cada lado (você compra 10 itens físicos, não frações).
function bestManipulatedMix(inputUnits, outputs, rate) {
  const usable = inputUnits
    .map((u) => {
      const floatMid = unitFloatMid(u);
      return floatMid != null ? { ...u, floatMid } : null;
    })
    .filter(Boolean);
  if (usable.length < 2) return null;

  let best = null;
  for (const a of usable) {
    for (const b of usable) {
      if (a.floatMid >= b.floatMid) continue; // a = float baixo, b = float alto (evita pares duplicados)
      for (let countB = 1; countB <= 9; countB++) {
        const countA = 10 - countB;
        const avgFloat = (countA * a.floatMid + countB * b.floatMid) / 10;
        const costCents = countA * a.wear.priceUsdCents + countB * b.wear.priceUsdCents;
        const costBrl = (costCents / 100) * rate;

        const outcomes = outputs
          .map((o) => {
            const predicted = predictOutcomePrice(o, avgFloat, rate);
            return {
              name: `${o.weapon} | ${o.skin}${o.stattrak ? " (StatTrak™)" : ""}`,
              prob: 100 / outputs.length,
              price: predicted.price,
              predictedWear: predicted.wear,
              priceIsEstimate: predicted.priceIsEstimate,
              minListings: o.minListings,
              iconUrl: o.iconUrl,
              floatRange: o.floatRange,
              wearPrices: wearPricesBrl(o, rate),
            };
          })
          .filter((o) => o.price != null);
        if (!outcomes.length) continue;

        const stats = computeContractStats(costBrl, outcomes);
        if (!Number.isFinite(stats.roi)) continue;

        if (!best || stats.roi > best.stats.roi) {
          best = { a, countA, b, countB, avgFloat, costBrl, outcomes, stats };
        }
      }
    }
  }
  return best;
}

// Sugestões de trade-up "manipulado": mesma base de dados e mesmo piso de
// liquidez de computeSingleCollectionSuggestions, mas em vez de fixar a
// entrada mais barata repetida 10x, testa misturas de 2 unidades diferentes
// pra ver se dá pra pilotar o float médio pra uma saída mais barata de
// atingir. Só entra na lista se render ROI melhor que a estratégia uniforme
// (a maioria das coleções não ganha nada misturando — o sinal fica só nos
// casos em que realmente compensa).
export async function computeManipulatedSuggestions({ minListings = 10 } = {}) {
  const { rate, menu, collectionNames } = await buildInputMenu(minListings);

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

        const inputUnits = [];
        for (const s of inputs) {
          for (const w of s.wears) {
            if (w.priceUsdCents == null) continue;
            inputUnits.push({ skin: s, wear: w });
          }
        }
        if (inputUnits.length < 2) continue;

        // Baseline pra comparação: a mesma estratégia uniforme (10x a
        // entrada mais barata) de computeSingleCollectionSuggestions.
        const cheapestUnit = inputUnits.reduce((min, u) =>
          u.wear.priceUsdCents < min.wear.priceUsdCents ? u : min
        );
        const baselineCostBrl = (cheapestUnit.wear.priceUsdCents / 100) * rate * 10;
        let baselineAvgFloat = null;
        if (cheapestUnit.skin.floatRange) {
          const band = bandForWear(cheapestUnit.skin, cheapestUnit.wear.exterior);
          if (band) baselineAvgFloat = (band.min + band.max) / 2;
        }
        const baselineOutcomes = outputs
          .map((o) => predictOutcomePrice(o, baselineAvgFloat, rate))
          .filter((p) => p.price != null)
          .map((p) => ({ prob: 100 / outputs.length, price: p.price }));
        const baselineStats = baselineOutcomes.length
          ? computeContractStats(baselineCostBrl, baselineOutcomes)
          : null;

        const mix = bestManipulatedMix(inputUnits, outputs, rate);
        if (!mix) continue;

        // Só vale a pena mostrar se a mistura bate a estratégia uniforme por
        // uma margem real — senão é só ruído numérico.
        if (baselineStats && mix.stats.roi <= baselineStats.roi + 0.5) continue;

        suggestions.push({
          collectionTag,
          collectionName: collectionNames.get(collectionTag) ?? collectionTag,
          tier,
          nextTier,
          stattrak: !!stattrak,
          legs: [
            {
              skinName: `${mix.a.skin.weapon} | ${mix.a.skin.skin}`,
              wear: mix.a.wear.exterior,
              count: mix.countA,
              unitPriceBrl: (mix.a.wear.priceUsdCents / 100) * rate,
              iconUrl: mix.a.skin.iconUrl,
            },
            {
              skinName: `${mix.b.skin.weapon} | ${mix.b.skin.skin}`,
              wear: mix.b.wear.exterior,
              count: mix.countB,
              unitPriceBrl: (mix.b.wear.priceUsdCents / 100) * rate,
              iconUrl: mix.b.skin.iconUrl,
            },
          ],
          assumedAvgFloat: mix.avgFloat,
          cost: mix.costBrl,
          baselineCost: baselineCostBrl,
          baselineRoi: baselineStats?.roi ?? null,
          outcomeCount: mix.outcomes.length,
          minOutputListings: Math.min(...mix.outcomes.map((o) => o.minListings)),
          outcomes: mix.outcomes,
          stats: mix.stats,
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

  const collection = db.prepare("SELECT name FROM collections WHERE tag = ?").get(collectionTag);
  if (!collection || !/^The .+ Collection$/.test(collection.name)) {
    // Não é uma Coleção de verdade do jogo (ex: pacote de Agentes, ou o
    // bucket genérico "Limited Edition Item") — não dá pra calcular trade-up
    // com garantia nenhuma de que os itens realmente compartilham a mesma
    // escada de raridade no jogo.
    return { rate, byTier: {} };
  }

  const floatMap = getFloatRangeMap();

  // Mesmo piso de liquidez de computeSingleCollectionSuggestions (ver
  // comentário lá) — sem isso, a pré-visualização por item podia previr uma
  // saída caríssima sustentada por 1-2 anúncios só.
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
    .all(collectionTag)
    .filter((r) => (r.sell_listings ?? 0) >= 10);

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
        name: `${o.weapon} | ${o.skin}${o.stattrak ? " (StatTrak™)" : ""}`,
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
        name: `${best.skin.weapon} | ${best.skin.skin}${best.skin.stattrak ? " (StatTrak™)" : ""}`,
        wear: best.wear.exterior,
        price: (best.wear.priceUsdCents / 100) * rate,
        requiredAvgFloatMin: required.min,
        requiredAvgFloatMax: required.max,
      };
    };

    const tierMenu = byRarity.get(tier);

    // Outcomes determinísticos por wear específico de entrada — a raridade
    // não muda a saída possível, mas o WEAR de cada item de entrada muda o
    // float médio assumido, e portanto o wear (e preço) previsto de cada
    // saída. Chave: "arma|skin|wear".
    const buildPerInput = (inputSkins, outputSkins) => {
      const perInput = {};
      for (const inSkin of inputSkins ?? []) {
        for (const w of inSkin.wears) {
          if (w.priceUsdCents == null) continue;
          let assumedAvgFloat = null;
          if (inSkin.floatRange) {
            const band = bandForWear(inSkin, w.exterior);
            if (band) assumedAvgFloat = (band.min + band.max) / 2;
          }
          const outcomes = outputSkins
            .map((o) => {
              const predicted = predictOutcomePrice(o, assumedAvgFloat, rate);
              return {
                name: `${o.weapon} | ${o.skin}${o.stattrak ? " (StatTrak™)" : ""}`,
                prob: 100 / outputSkins.length,
                price: predicted.price,
                predictedWear: predicted.wear,
                priceIsEstimate: predicted.priceIsEstimate,
                minListings: o.minListings,
                iconUrl: o.iconUrl,
                floatRange: o.floatRange,
                wearPrices: wearPricesBrl(o, rate),
              };
            })
            .filter((o) => o.price != null);
          if (!outcomes.length) continue;
          perInput[`${inSkin.weapon}|${inSkin.skin}|${w.exterior}`] = { assumedAvgFloat, outcomes };
        }
      }
      return perInput;
    };

    byTier[tier] = {
      nextTier,
      normal: nextMenu[0].length ? toOutcomes(nextMenu[0]) : [],
      stattrak: nextMenu[1].length ? toOutcomes(nextMenu[1]) : [],
      bestOutcomeNormal: nextMenu[0].length ? bestPerSide(nextMenu[0]) : null,
      bestOutcomeStattrak: nextMenu[1].length ? bestPerSide(nextMenu[1]) : null,
      perInputNormal: buildPerInput(tierMenu?.[0], nextMenu[0]),
      perInputStattrak: buildPerInput(tierMenu?.[1], nextMenu[1]),
    };
  }

  return { rate, byTier };
}
