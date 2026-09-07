import { db } from "./db.js";
import { getUsdToBrlRate } from "./fx.js";
import { RARITY_ORDER } from "./rarity.js";
import { getFloatRangeMap } from "./floatData.js";
import {
  clippedBands,
  requiredAvgFloatRange,
  rangesOverlap,
  outputFloatFromAvg,
  normalizeFloat,
} from "./floatMath.js";

// `sell_price` do endpoint de busca é o preço pago pelo comprador. Ao vender
// no Mercado Steam, o vendedor recebe aproximadamente preço / 1,15 (5% de
// taxa Steam + 10% de taxa de CS2; os centavos são arredondados pela Steam).
// Usar o valor líquido aqui evita chamar de lucro um valor que nunca chega à
// carteira. O arredondamento exato só pode ser conhecido na tela de anúncio.
export const STEAM_NET_SALE_FACTOR = 1 / 1.15;

function netSalePrice(marketPrice) {
  return marketPrice * STEAM_NET_SALE_FACTOR;
}

// Mesma fórmula de src/lib/tradeUpMath.js do frontend — duplicada de
// propósito (é pouca lógica, e mantém backend/frontend independentes).
function computeContractStats(cost, outcomes) {
  const totalProbRaw = outcomes.reduce((s, o) => s + o.prob, 0) || 1;
  const grossEv = outcomes.reduce((s, o) => s + (o.prob / totalProbRaw) * o.price, 0);
  const ev = outcomes.reduce((s, o) => s + (o.prob / totalProbRaw) * netSalePrice(o.price), 0);
  const evProfit = ev - cost;
  const roi = cost > 0 ? (evProfit / cost) * 100 : 0;
  const probLoss =
    (outcomes.filter((o) => netSalePrice(o.price) < cost).reduce((s, o) => s + o.prob, 0) / totalProbRaw) * 100;

  // Melhor/pior caso = lucro líquido SE a saída mais cara/mais barata for a
  // que sair (não pesa pela probabilidade, é o extremo do intervalo). Serve
  // pra contratos de alto risco (tipo 50/50) onde a média sozinha esconde o
  // quão bom o lado bom pode ser — ou quão ruim o lado ruim.
  const netPrices = outcomes.map((o) => netSalePrice(o.price));
  const bestCaseProfit = Math.max(...netPrices) - cost;
  const worstCaseProfit = Math.min(...netPrices) - cost;

  // "Quantos acertos em 10 tentativas pra não sair no prejuízo": agrupa as
  // saídas em "ganha" (líquido >= custo) e "perde", pega o lucro/prejuízo
  // MÉDIO de cada grupo (ponderado pela chance relativa dentro do grupo), e
  // resolve k*ganhoMédio + (10-k)*perdaMédia >= 0 pro menor k inteiro. Isso
  // é o que separa "arriscado mas compensa" de "arriscado e não compensa":
  // um contrato de 80% de risco de perda ainda pode empatar acertando só
  // 2 ou 3 vezes em 10 se o prêmio for grande o suficiente.
  const winOutcomes = outcomes.filter((o) => netSalePrice(o.price) >= cost);
  const loseOutcomes = outcomes.filter((o) => netSalePrice(o.price) < cost);
  const winProbSum = winOutcomes.reduce((s, o) => s + o.prob, 0);
  const loseProbSum = loseOutcomes.reduce((s, o) => s + o.prob, 0);
  const avgWinProfit =
    winProbSum > 0
      ? winOutcomes.reduce((s, o) => s + (o.prob / winProbSum) * (netSalePrice(o.price) - cost), 0)
      : null;
  const avgLossProfit =
    loseProbSum > 0
      ? loseOutcomes.reduce((s, o) => s + (o.prob / loseProbSum) * (netSalePrice(o.price) - cost), 0)
      : null;

  let breakEvenHits10 = null;
  if (avgWinProfit != null && avgWinProfit > 0) {
    breakEvenHits10 =
      avgLossProfit == null || avgLossProfit >= 0
        ? 0
        : Math.min(10, Math.max(0, Math.ceil((-10 * avgLossProfit) / (avgWinProfit - avgLossProfit) - 1e-9)));
  }

  let verdict;
  if (roi > 15 && probLoss < 40) verdict = "Good deal";
  else if (roi > 0) verdict = "Risky";
  else verdict = "Trap";

  return {
    grossEv,
    grossRoi: cost > 0 ? ((grossEv - cost) / cost) * 100 : 0,
    ev,
    evProfit,
    roi,
    bestCaseProfit,
    bestCaseRoi: cost > 0 ? (bestCaseProfit / cost) * 100 : 0,
    worstCaseProfit,
    worstCaseRoi: cost > 0 ? (worstCaseProfit / cost) * 100 : 0,
    avgWinProfit,
    avgLossProfit,
    breakEvenHits10,
    saleFactor: STEAM_NET_SALE_FACTOR,
    probLoss: Math.min(100, Math.max(0, probLoss)),
    verdict,
  };
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

// Nome exato de mercado (Steam usa isso como identificador da página do
// item) — serve pra montar um link direto pra página certa, eliminando
// qualquer ambiguidade sobre qual wear comprar (crítico pro trade-up
// manipulado: comprar o wear errado destrói a mistura calculada).
function marketHashName({ weapon, skin, exterior, stattrak, souvenir }) {
  const prefix = souvenir ? "Souvenir " : stattrak ? "StatTrak™ " : "";
  return `${prefix}${weapon} | ${skin} (${exterior})`;
}

// Nome de mercado de uma saída (outcome) de trade-up, pro link "abrir no
// mercado" — precisa do wear previsto (senão não dá pra saber qual página
// da Steam abrir) e do nome da skin (saídas tipo faca vanilla não têm).
function outcomeMarketHashName(output, exterior, stattrak) {
  if (!exterior || !output.skin) return null;
  return marketHashName({ weapon: output.weapon, skin: output.skin, exterior, stattrak: !!stattrak, souvenir: false });
}

function priceForWear(skinGroup, exterior) {
  return skinGroup.wears.find((w) => w.exterior === exterior)?.priceUsdCents ?? null;
}

// O float médio que entra na fórmula de trade-up é RELATIVO (normalizado
// 0–1 pela faixa própria de CADA skin de entrada), não o float bruto — ver
// normalizeFloat em floatMath.js. Sem isso, uma skin com faixa estreita
// (ex: 0–0.5) tem seu desgaste relativo subestimado pela metade, o que
// explica saídas "piores que o esperado" mesmo comprando Factory New.
//
// Usa o PIOR (mais alto) float dentro da banda do wear escolhido, não o
// meio — confirmado na prática: dentro do mesmo wear, o anúncio mais
// barato tende a ter o float mais alto daquele wear (float baixo dentro
// da categoria é raro e vendido bem mais caro, mesmo sem trocar de wear).
// Assumir o meio da faixa era otimista demais: previa um float de entrada
// melhor do que o que dá pra comprar pelo preço mostrado, inflando o
// float médio previsto do contrato — e a chance de uma saída realmente
// vir no wear calculado.
function assumedFloatForWear(skinGroup, exterior) {
  if (!skinGroup.floatRange) return null;
  const band = bandForWear(skinGroup, exterior);
  if (!band) return null;
  const rawWorstCase = band.max;
  return normalizeFloat(rawWorstCase, skinGroup.floatRange.min, skinGroup.floatRange.max);
}

// O wear de saída NÃO é sorteado: é determinístico a partir da média de
// float de entrada. Uma sugestão só recebe preço quando esse wear exato tem
// anúncio líquido. Não substituímos pelo wear vizinho nem pela média da skin:
// isso criava EVs fictícios e escondia o risco da saída sem mercado.
function predictOutcomePrice(outputSkin, assumedAvgFloat, rate) {
  let predictedWear = null;
  let targetBand = null;
  let predictedFloatValue = null;

  if (assumedAvgFloat != null && outputSkin.floatRange) {
    predictedFloatValue = outputFloatFromAvg(
      assumedAvgFloat,
      outputSkin.floatRange.min,
      outputSkin.floatRange.max
    );
    targetBand = bandForFloat(outputSkin, predictedFloatValue);
    if (targetBand) {
      predictedWear = targetBand.name;
      const cents = priceForWear(outputSkin, targetBand.name);
      if (cents != null) {
        return {
          price: (cents / 100) * rate,
          wear: targetBand.name,
          predicted: true,
          priceIsEstimate: false,
          predictedFloatValue,
        };
      }
    }
  }

  return {
    price: null,
    wear: predictedWear,
    predicted: false,
    priceIsEstimate: false,
    predictedFloatValue,
  };
}

function hasVerifiedPrices(outcomes) {
  return outcomes.length > 0 && outcomes.every((outcome) => outcome.price != null && !outcome.priceIsEstimate);
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
      // inputAchievable fica em float BRUTO (é o que aparece na tela, o
      // float real do item que você compraria). A checagem de viabilidade
      // precisa comparar em espaço RELATIVO (normalizado pela faixa própria
      // dessa skin de entrada) contra `required`, que já é relativo — ver
      // normalizeFloat em floatMath.js.
      inputAchievable = { min: inBand.min, max: inBand.max };
      const achievableAdjusted = {
        min: normalizeFloat(inBand.min, cheapestInput.floatRange.min, cheapestInput.floatRange.max),
        max: normalizeFloat(inBand.max, cheapestInput.floatRange.min, cheapestInput.floatRange.max),
      };
      feasible = rangesOverlap(achievableAdjusted, required);
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
// Taxa de conversão a aplicar sobre os preços em USD-cents guardados no
// banco. USD é a moeda "nativa" (vem direto do Steam), então nesse caso o
// fator é 1 — só busca a taxa de câmbio quando o pedido é em BRL.
async function resolveRate(currency) {
  return currency === "brl" ? await getUsdToBrlRate(db) : 1;
}

async function buildInputMenu(minListings, currency = "usd") {
  const rate = await resolveRate(currency);
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

  // Itens Lembrança podem ser usados como MATERIAL de entrada num contrato
  // normal desde a atualização de trade-up de 2026 — dá pra misturar
  // Lembrança com item normal no mesmo contrato de 10, e a saída sempre vira
  // um item normal (nunca Lembrança, nunca StatTrak — StatTrak e Lembrança
  // são mutuamente exclusivos, então isso só entra no lado Normal). Como
  // Lembrança costuma ser mais barata que a versão normal da mesma skin,
  // isso abre material de entrada mais barato pro contrato normal.
  const souvenirRows = db
    .prepare(
      `SELECT collection_tag, rarity, stattrak, weapon, skin, exterior, icon_url, price_usd_cents, sell_listings
       FROM items
       WHERE commodity = 0
         AND exterior IS NOT NULL
         AND special = 0
         AND souvenir = 1
         AND rarity IS NOT NULL
         AND price_usd_cents IS NOT NULL
         AND ${REAL_COLLECTION_FILTER}`
    )
    .all()
    .filter((r) => (r.sell_listings ?? 0) >= minListings);

  const souvenirSkins = groupIntoSkins(souvenirRows, floatMap).filter((s) => s.avgUsdCents != null);

  // souvenirMenu[collectionTag][rarity] = [skins...] (só existe versão
  // normal de Lembrança, não tem eixo StatTrak aqui)
  const souvenirMenu = new Map();
  for (const s of souvenirSkins) {
    if (!souvenirMenu.has(s.collectionTag)) souvenirMenu.set(s.collectionTag, new Map());
    const byRarity = souvenirMenu.get(s.collectionTag);
    if (!byRarity.has(s.rarity)) byRarity.set(s.rarity, []);
    byRarity.get(s.rarity).push(s);
  }

  return { rate, menu, souvenirMenu, collectionNames };
}

// Unidades de material Lembrança pra uma coleção/raridade (só faz sentido
// pro lado Normal — ver comentário acima). Cada wear vira uma unidade
// comprável marcada isSouvenir, do mesmo jeito que as unidades normais.
function souvenirInputUnits(souvenirMenu, collectionTag, tier) {
  const skins = souvenirMenu.get(collectionTag)?.get(tier);
  if (!skins?.length) return [];
  const units = [];
  for (const s of skins) {
    for (const w of s.wears) {
      if (w.priceUsdCents == null) continue;
      units.push({ skin: s, wear: w, isSouvenir: true });
    }
  }
  return units;
}

// Desde outubro de 2025, 5 Covert viram uma faca (StatTrak) ou uma faca/luva
// normal da coleção de um dos inputs. Esses especiais aparecem no Market como
// Covert + `special = 1`; não fazem parte da escada normal Classified →
// Covert, então precisam de um scanner próprio.
async function computeFiveCovertSuggestions({ minListings = 10, currency = "usd" } = {}) {
  const { rate, menu, collectionNames } = await buildInputMenu(minListings, currency);
  const floatMap = getFloatRangeMap();
  const specialRows = db
    .prepare(
      `SELECT collection_tag, rarity, stattrak, weapon, skin, exterior, icon_url, price_usd_cents, sell_listings
       FROM items
       WHERE commodity = 0
         AND exterior IS NOT NULL
         AND special = 1
         AND rarity = 'Covert'
         AND price_usd_cents IS NOT NULL
         AND ${REAL_COLLECTION_FILTER}`
    )
    .all()
    .filter((r) => (r.sell_listings ?? 0) >= minListings);
  const specialSkins = groupIntoSkins(specialRows, floatMap);
  const specialsByCollection = new Map();
  for (const skin of specialSkins) {
    if (!specialsByCollection.has(skin.collectionTag)) specialsByCollection.set(skin.collectionTag, new Map());
    const byStatTrak = specialsByCollection.get(skin.collectionTag);
    const key = skin.stattrak ? 1 : 0;
    if (!byStatTrak.has(key)) byStatTrak.set(key, []);
    byStatTrak.get(key).push(skin);
  }

  const suggestions = [];
  for (const [collectionTag, byRarity] of menu) {
    for (const stattrak of [0, 1]) {
      const inputs = byRarity.get("Covert")?.[stattrak] ?? [];
      const outputs = specialsByCollection.get(collectionTag)?.get(stattrak) ?? [];
      if (!inputs.length || !outputs.length) continue;

      const inputUnits = [];
      for (const skin of inputs) {
        for (const wear of skin.wears) {
          if (wear.priceUsdCents != null) inputUnits.push({ skin, wear });
        }
      }
      if (!inputUnits.length) continue;

      const cheapestUnit = inputUnits.reduce((min, unit) =>
        unit.wear.priceUsdCents < min.wear.priceUsdCents ? unit : min
      );
      const assumedAvgFloat = assumedFloatForWear(cheapestUnit.skin, cheapestUnit.wear.exterior);
      if (assumedAvgFloat == null) continue;

      const outcomes = outputs.map((output) => {
        const predicted = predictOutcomePrice(output, assumedAvgFloat, rate);
        return {
          name: `★ ${output.weapon}${output.skin ? ` | ${output.skin}` : ""}${stattrak ? " (StatTrak™)" : ""}`,
          weapon: output.weapon,
          skin: output.skin,
          stattrak: !!stattrak,
          prob: 100 / outputs.length,
          price: predicted.price,
          netPrice: predicted.price == null ? null : netSalePrice(predicted.price),
          predictedWear: predicted.wear,
          predictedFloatValue: predicted.predictedFloatValue,
          priceIsEstimate: false,
          marketHashName: outcomeMarketHashName(output, predicted.wear, stattrak),
          minListings: output.minListings,
          iconUrl: output.iconUrl,
          floatRange: output.floatRange,
          wearPrices: wearPricesBrl(output, rate),
          isSpecial: true,
        };
      });
      if (!hasVerifiedPrices(outcomes)) continue;

      const costBrl = (cheapestUnit.wear.priceUsdCents / 100) * rate * 5;
      const stats = computeContractStats(costBrl, outcomes);
      if (!Number.isFinite(stats.roi)) continue;

      suggestions.push({
        collectionTag,
        collectionName: collectionNames.get(collectionTag) ?? collectionTag,
        tier: "Covert",
        nextTier: "★ Faca/Luvas",
        stattrak: !!stattrak,
        inputCount: 5,
        contractType: "five-covert",
        inputSkin: `${cheapestUnit.skin.weapon} | ${cheapestUnit.skin.skin}`,
        inputWear: cheapestUnit.wear.exterior,
        inputIconUrl: cheapestUnit.skin.iconUrl,
        inputListings: cheapestUnit.wear.sellListings,
        inputIsSouvenir: false,
        inputMarketHashName: marketHashName({
          weapon: cheapestUnit.skin.weapon,
          skin: cheapestUnit.skin.skin,
          exterior: cheapestUnit.wear.exterior,
          stattrak: !!stattrak,
          souvenir: false,
        }),
        inputFloatRange: cheapestUnit.skin.floatRange,
        inputWearFloatRange: bandForWear(cheapestUnit.skin, cheapestUnit.wear.exterior),
        assumedAvgFloat,
        cost: costBrl,
        outcomeCount: outcomes.length,
        minOutputListings: Math.min(...outcomes.map((outcome) => outcome.minListings)),
        outcomes,
        stats,
        floatInfo: computeFloatGuidance({ cheapestInput: cheapestUnit.skin, outputs, rate }),
      });
    }
  }
  return suggestions;
}

// Mantém alternativas reais, mas corta ruído: dentro da mesma coleção/tier,
// uma opção é dominada se outra custa menos, dá pelo menos o mesmo lucro
// esperado líquido e não aumenta a chance de perda. Assim o scanner testa
// todo skin+wear (inclusive os que compram um float melhor), sem despejar na
// tabela centenas de escolhas objetivamente piores.
function paretoFrontier(candidates, limit = 30) {
  const EPS = 1e-9;
  const frontier = candidates.filter((candidate, index) =>
    !candidates.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      const noWorse =
        other.cost <= candidate.cost + EPS &&
        other.stats.evProfit >= candidate.stats.evProfit - EPS &&
        other.stats.probLoss <= candidate.stats.probLoss + EPS;
      const strictlyBetter =
        other.cost < candidate.cost - EPS ||
        other.stats.evProfit > candidate.stats.evProfit + EPS ||
        other.stats.probLoss < candidate.stats.probLoss - EPS;
      return noWorse && strictlyBetter;
    })
  );
  return frontier
    .sort((a, b) => b.stats.roi - a.stats.roi || a.stats.probLoss - b.stats.probLoss || a.cost - b.cost)
    .slice(0, limit);
}

// Gera sugestões de trade-up de UMA coleção só (o tipo clássico: 10 skins da
// mesma coleção e raridade). Trade-ups misturando coleções ficam pra uma
// próxima etapa (o espaço de busca cresce muito mais).
export async function computeSingleCollectionSuggestions({ minListings = 10, currency = "usd" } = {}) {
  const { rate, menu, souvenirMenu, collectionNames } = await buildInputMenu(minListings, currency);

  const suggestions = [];

  for (const [collectionTag, byRarity] of menu) {
    for (let i = 0; i < RARITY_ORDER.length - 1; i++) {
      const tier = RARITY_ORDER[i];
      const nextTier = RARITY_ORDER[i + 1];
      const tierMenu = byRarity.get(tier);
      const nextMenu = byRarity.get(nextTier);
      if (!nextMenu) continue;

      for (const stattrak of [0, 1]) {
        const inputs = tierMenu?.[stattrak];
        const outputs = nextMenu[stattrak];
        if (!outputs?.length) continue;

        // Unidades realmente compráveis: cada skin+wear específico com
        // preço, não a média da skin (você não compra "a média"). Já vêm só
        // com liquidez suficiente, porque `rows` já foi filtrado acima.
        const inputUnits = [];
        for (const s of inputs ?? []) {
          for (const w of s.wears) {
            if (w.priceUsdCents == null) continue;
            inputUnits.push({ skin: s, wear: w });
          }
        }
        // Lembrança só entra no lado Normal (StatTrak e Lembrança são
        // mutuamente exclusivos no jogo) — mas conta como material tão
        // válido quanto o normal, então entra na mesma lista de opções pra
        // achar a entrada mais barata.
        if (stattrak === 0) {
          inputUnits.push(...souvenirInputUnits(souvenirMenu, collectionTag, tier));
        }
        if (!inputUnits.length) continue;

        const candidates = [];
        for (const inputUnit of inputUnits) {
          const costBrl = (inputUnit.wear.priceUsdCents / 100) * rate * 10;
          // Usa o pior float dentro do wear anunciado: não assume que o item
          // mais barato é uma versão low-float escondida dentro da mesma faixa.
          const assumedAvgFloat = assumedFloatForWear(inputUnit.skin, inputUnit.wear.exterior);
          if (assumedAvgFloat == null) continue;

          const outcomes = outputs.map((o) => {
            const predicted = predictOutcomePrice(o, assumedAvgFloat, rate);
            return {
              name: `${o.weapon} | ${o.skin}${stattrak ? " (StatTrak™)" : ""}`,
              weapon: o.weapon,
              skin: o.skin,
              stattrak: !!stattrak,
              prob: 100 / outputs.length,
              price: predicted.price,
              netPrice: predicted.price == null ? null : netSalePrice(predicted.price),
              predictedWear: predicted.wear,
              predictedFloatValue: predicted.predictedFloatValue,
              priceIsEstimate: false,
              marketHashName: outcomeMarketHashName(o, predicted.wear, stattrak),
              minListings: o.minListings,
              iconUrl: o.iconUrl,
              floatRange: o.floatRange,
              wearPrices: wearPricesBrl(o, rate),
            };
          });
          if (!hasVerifiedPrices(outcomes)) continue;

          const stats = computeContractStats(costBrl, outcomes);
          if (!Number.isFinite(stats.roi)) continue;

          candidates.push({
            collectionTag,
            collectionName: collectionNames.get(collectionTag) ?? collectionTag,
            tier,
            nextTier,
            stattrak: !!stattrak,
            inputCount: 10,
            inputSkin: `${inputUnit.skin.weapon} | ${inputUnit.skin.skin}`,
            inputWear: inputUnit.wear.exterior,
            inputIconUrl: inputUnit.skin.iconUrl,
            inputListings: inputUnit.wear.sellListings,
            inputIsSouvenir: !!inputUnit.isSouvenir,
            inputMarketHashName: marketHashName({
              weapon: inputUnit.skin.weapon,
              skin: inputUnit.skin.skin,
              exterior: inputUnit.wear.exterior,
              stattrak: !!stattrak,
              souvenir: !!inputUnit.isSouvenir,
            }),
            inputFloatRange: inputUnit.skin.floatRange,
            inputWearFloatRange: bandForWear(inputUnit.skin, inputUnit.wear.exterior),
            assumedAvgFloat,
            cost: costBrl,
            outcomeCount: outcomes.length,
            minOutputListings: Math.min(...outcomes.map((o) => o.minListings)),
            outcomes,
            stats,
            floatInfo: computeFloatGuidance({ cheapestInput: inputUnit.skin, outputs, rate }),
          });
        }
        suggestions.push(...paretoFrontier(candidates));
      }
    }
  }

  suggestions.push(...(await computeFiveCovertSuggestions({ minListings, currency })));

  suggestions.sort((a, b) => b.stats.roi - a.stats.roi);
  return { rate, currency, suggestions };
}

// Float médio RELATIVO (normalizado pela faixa própria da skin, ver
// assumedFloatForWear) de uma unidade comprável específica (skin+wear).
// Crítico aqui especificamente: ao misturar unidades de skins DIFERENTES,
// a média só faz sentido físico em espaço relativo — misturar floats brutos
// de duas skins com faixas próprias diferentes dá um número sem significado.
function unitFloatMid(unit) {
  return assumedFloatForWear(unit.skin, unit.wear.exterior);
}

// Monta um "leg" pronto pro JSON de resposta a partir de uma unidade
// (skin+wear) e sua contagem — usado tanto pra mistura dentro da mesma
// coleção quanto pra coringa de outra coleção.
function buildLeg(unit, count, stattrak, rate, collectionNames) {
  return {
    skinName: `${unit.skin.weapon} | ${unit.skin.skin}`,
    wear: unit.wear.exterior,
    count,
    unitPriceBrl: (unit.wear.priceUsdCents / 100) * rate,
    iconUrl: unit.skin.iconUrl,
    floatRange: unit.skin.floatRange,
    wearFloatRange: bandForWear(unit.skin, unit.wear.exterior),
    isSouvenir: !!unit.isSouvenir,
    collectionTag: unit.skin.collectionTag,
    collectionName: collectionNames.get(unit.skin.collectionTag) ?? unit.skin.collectionTag,
    marketHashName: marketHashName({
      weapon: unit.skin.weapon,
      skin: unit.skin.skin,
      exterior: unit.wear.exterior,
      stattrak: !!stattrak,
      souvenir: !!unit.isSouvenir,
    }),
  };
}

// Constrói os outcomes de um contrato cujas unidades podem vir de MAIS DE
// UMA coleção — regra oficial do jogo: a chance de a saída vir de uma
// coleção é proporcional a quantos dos 10 inputs vieram dela; dentro da
// coleção sorteada, a chance é igual entre as saídas elegíveis daquela
// raridade. `groups` é um Map collectionTag -> { count, outputs }.
function outcomesAcrossGroups(groups, avgFloat, stattrak, rate) {
  const outcomes = [];
  for (const { count, outputs } of groups.values()) {
    if (!outputs.length) continue;
    const probEach = ((count / 10) * 100) / outputs.length;
    for (const o of outputs) {
      const predicted = predictOutcomePrice(o, avgFloat, rate);
      outcomes.push({
        name: `${o.weapon} | ${o.skin}${stattrak ? " (StatTrak™)" : ""}`,
        weapon: o.weapon,
        skin: o.skin,
        stattrak: !!stattrak,
        prob: probEach,
        price: predicted.price,
        netPrice: predicted.price == null ? null : netSalePrice(predicted.price),
        predictedWear: predicted.wear,
        predictedFloatValue: predicted.predictedFloatValue,
        priceIsEstimate: predicted.priceIsEstimate,
        marketHashName: outcomeMarketHashName(o, predicted.wear, stattrak),
        minListings: o.minListings,
        iconUrl: o.iconUrl,
        floatRange: o.floatRange,
        wearPrices: wearPricesBrl(o, rate),
        fromCollectionTag: o.collectionTag,
      });
    }
  }
  return outcomes;
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
function bestManipulatedMix(inputUnits, outputs, stattrak, rate) {
  const usable = inputUnits
    .map((u) => {
      const floatMid = unitFloatMid(u);
      return floatMid != null ? { ...u, floatMid } : null;
    })
    .filter(Boolean);
  if (usable.length < 2) return null;

  const outputGroup = { count: 10, outputs };

  let best = null;
  for (const a of usable) {
    for (const b of usable) {
      if (a.floatMid >= b.floatMid) continue; // a = float baixo, b = float alto (evita pares duplicados)
      for (let countB = 1; countB <= 9; countB++) {
        const countA = 10 - countB;
        const avgFloat = (countA * a.floatMid + countB * b.floatMid) / 10;
        const costCents = countA * a.wear.priceUsdCents + countB * b.wear.priceUsdCents;
        const costBrl = (costCents / 100) * rate;

        const outcomes = outcomesAcrossGroups(new Map([["_", outputGroup]]), avgFloat, stattrak, rate);
        if (!hasVerifiedPrices(outcomes)) continue;

        const stats = computeContractStats(costBrl, outcomes);
        if (!Number.isFinite(stats.roi)) continue;

        if (!best || stats.roi > best.stats.roi) {
          best = {
            legInfos: [
              { unit: a, count: countA },
              { unit: b, count: countB },
            ],
            avgFloat,
            costBrl,
            outcomes,
            stats,
            crossCollection: false,
          };
        }
      }
    }
  }
  return best;
}

// Variante "coringa": a maioria das 10 entradas continua sendo da coleção
// principal (repetindo a unidade mais barata dela), mas um punhado vem de
// OUTRA coleção só pra ajustar o float médio mais barato do que qualquer
// combinação dentro da própria coleção permite. Isso é uma troca real: o
// jogo sorteia a saída proporcional a quantos dos 10 vieram de cada
// coleção, então usar coringas dilui parte da chance pra outputs da
// coleção do coringa — por isso só compensa quando o ganho de custo supera
// isso, e o resultado deixa claro de onde cada saída possível vem.
function bestCrossCollectionMix(primaryUnits, primaryCollectionTag, primaryOutputs, wildcardUnits, stattrak, rate) {
  const primaryWithFloat = primaryUnits
    .map((u) => {
      const floatMid = unitFloatMid(u);
      return floatMid != null ? { ...u, floatMid } : null;
    })
    .filter(Boolean);
  if (!primaryWithFloat.length || !wildcardUnits.length) return null;

  let best = null;
  for (const p of primaryWithFloat) {
    for (const w of wildcardUnits) {
      if (w.skin.collectionTag === primaryCollectionTag) continue;
      const lo = p.floatMid <= w.floatMid ? p : w;
      const hi = p.floatMid <= w.floatMid ? w : p;
      if (lo.floatMid === hi.floatMid) continue;

      for (let countHi = 1; countHi <= 9; countHi++) {
        const countLo = 10 - countHi;
        const avgFloat = (countLo * lo.floatMid + countHi * hi.floatMid) / 10;
        const countP = lo === p ? countLo : countHi;
        const countW = 10 - countP;
        const costCents = countP * p.wear.priceUsdCents + countW * w.wear.priceUsdCents;
        const costBrl = (costCents / 100) * rate;

        const wildcardOutputs = w.outputs;
        const groups = new Map([
          [primaryCollectionTag, { count: countP, outputs: primaryOutputs }],
          [w.skin.collectionTag, { count: countW, outputs: wildcardOutputs }],
        ]);
        const outcomes = outcomesAcrossGroups(groups, avgFloat, stattrak, rate);
        if (!hasVerifiedPrices(outcomes)) continue;

        const stats = computeContractStats(costBrl, outcomes);
        if (!Number.isFinite(stats.roi)) continue;

        if (!best || stats.roi > best.stats.roi) {
          best = {
            legInfos: [
              { unit: p, count: countP },
              { unit: w, count: countW },
            ],
            avgFloat,
            costBrl,
            outcomes,
            stats,
            crossCollection: true,
          };
        }
      }
    }
  }
  return best;
}

// Generaliza a mistura pra 3 tipos de unidade — podendo vir de até 3
// coleções diferentes ao mesmo tempo, não só principal + 1 coringa. O
// argumento de "2 pernas basta" em bestManipulatedMix vale pra minimizar
// custo sujeito a UM alvo de float fixo; mas cada alvo de float diferente
// pode acertar uma banda de preço de saída diferente (o preço muda em
// degraus, não linearmente), então testar trincas pode achar um degrau que
// nenhum par alcança. Cresce ao cubo do tamanho do pool, por isso o pool
// aqui (`candidates`) já vem bem mais restrito — só extremos de float e as
// entradas mais baratas de cada lado, escolhidos por quem chama.
function bestTripleMix(candidates, outputsForTag, stattrak, rate) {
  const usable = candidates
    .map((u) => {
      const floatMid = unitFloatMid(u);
      return floatMid != null ? { ...u, floatMid } : null;
    })
    .filter((u) => u && outputsForTag(u.skin.collectionTag)?.length);
  if (usable.length < 3) return null;

  let best = null;
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      for (let k = j + 1; k < usable.length; k++) {
        const legs = [usable[i], usable[j], usable[k]];
        for (let c1 = 1; c1 <= 8; c1++) {
          for (let c2 = 1; c2 <= 9 - c1; c2++) {
            const c3 = 10 - c1 - c2;
            const counts = [c1, c2, c3];
            const avgFloat =
              (legs[0].floatMid * c1 + legs[1].floatMid * c2 + legs[2].floatMid * c3) / 10;
            const costCents =
              legs[0].wear.priceUsdCents * c1 + legs[1].wear.priceUsdCents * c2 + legs[2].wear.priceUsdCents * c3;
            const costBrl = (costCents / 100) * rate;

            const groups = new Map();
            for (let idx = 0; idx < 3; idx++) {
              const tag = legs[idx].skin.collectionTag;
              const outputs = outputsForTag(tag);
              const existing = groups.get(tag);
              if (existing) existing.count += counts[idx];
              else groups.set(tag, { count: counts[idx], outputs });
            }

            const outcomes = outcomesAcrossGroups(groups, avgFloat, stattrak, rate);
            if (!hasVerifiedPrices(outcomes)) continue;

            const stats = computeContractStats(costBrl, outcomes);
            if (!Number.isFinite(stats.roi)) continue;

            if (!best || stats.roi > best.stats.roi) {
              best = {
                legInfos: legs.map((leg, idx) => ({ unit: leg, count: counts[idx] })),
                avgFloat,
                costBrl,
                outcomes,
                stats,
                crossCollection: new Set(legs.map((l) => l.skin.collectionTag)).size > 1,
              };
            }
          }
        }
      }
    }
  }
  return best;
}

// Sugestões de trade-up "manipulado": mesma base de dados e mesmo piso de
// liquidez de computeSingleCollectionSuggestions, mas em vez de fixar a
// entrada mais barata repetida 10x, testa (1) misturas de 2 unidades da
// mesma coleção e (2) misturas com um "coringa" de outra coleção, pra ver
// se dá pra pilotar o float médio pra uma saída mais barata de atingir. Só
// entra na lista se render ROI melhor que a estratégia uniforme (a maioria
// das coleções não ganha nada misturando — o sinal fica só nos casos em que
// realmente compensa).
// `exhaustive`: pro job em background (ver manipulatedJob.js) — remove o
// corte do pool de coringas pra TODAS as raridades, não só Restricted/
// Classified. Buscar contra toda unidade de toda coleção em Consumer/
// Industrial/Mil-Spec é caro (pode levar horas), por isso isso só roda
// quando pedido explicitamente, nunca na rota síncrona normal.
export async function computeManipulatedSuggestions({ minListings = 10, exhaustive = false, currency = "usd" } = {}) {
  const { rate, menu, souvenirMenu, collectionNames } = await buildInputMenu(minListings, currency);

  const suggestions = [];

  for (let i = 0; i < RARITY_ORDER.length - 1; i++) {
    const tier = RARITY_ORDER[i];
    const nextTier = RARITY_ORDER[i + 1];

    for (const stattrak of [0, 1]) {
      const outputsFor = (collectionTag) => menu.get(collectionTag)?.get(nextTier)?.[stattrak] ?? [];

      // Pool de coringas pra esse tier+stattrak: unidades de QUALQUER
      // coleção cuja PRÓPRIA coleção tenha saída válida na raridade
      // seguinte (senão não dá pra prever preço daquela fração da chance).
      // Restrito aos mais extremos em float relativo (bem baixo ou bem
      // alto) — são esses que valem a pena trazer de fora só pra ajustar o
      // float; testar toda unidade de toda coleção contra toda coleção
      // seria caro demais e a maioria não ajudaria em nada.
      const allUnitsThisTier = [];
      for (const [collectionTag, byRarity] of menu) {
        const outputs = outputsFor(collectionTag);
        if (!outputs.length) continue;
        const skinsAtTier = byRarity.get(tier)?.[stattrak] ?? [];
        for (const s of skinsAtTier) {
          for (const w of s.wears) {
            if (w.priceUsdCents == null) continue;
            allUnitsThisTier.push({ skin: s, wear: w, outputs });
          }
        }
        if (stattrak === 0) {
          for (const u of souvenirInputUnits(souvenirMenu, collectionTag, tier)) {
            allUnitsThisTier.push({ ...u, outputs });
          }
        }
      }
      const withFloat = allUnitsThisTier
        .map((u) => {
          const floatMid = unitFloatMid(u);
          return floatMid != null ? { ...u, floatMid } : null;
        })
        .filter(Boolean);
      // Restricted e Classified (as raridades que viram Classified/Covert —
      // as saídas de maior valor) têm muito menos itens no catálogo inteiro
      // que as raridades baixas, então dá pra buscar bem mais fundo sem o
      // custo explodir. Pras raridades baixas (Consumer/Industrial/Mil-Spec,
      // com milhares de linhas) mantém o corte pequeno — exceto no modo
      // exaustivo (job em background), que usa tudo, em qualquer raridade.
      const lowFloatSorted = [...withFloat].sort(
        (a, b) => a.floatMid - b.floatMid || a.wear.priceUsdCents - b.wear.priceUsdCents
      );
      const highFloatSorted = [...withFloat].sort(
        (a, b) => b.floatMid - a.floatMid || a.wear.priceUsdCents - b.wear.priceUsdCents
      );

      let wildcardPool;
      if (exhaustive) {
        wildcardPool = withFloat;
      } else {
        const cap = tier === "Restricted" || tier === "Classified" ? 200 : 15;
        wildcardPool = [...lowFloatSorted.slice(0, cap), ...highFloatSorted.slice(0, cap)];
      }

      // Pool bem menor pra mistura de 3 pernas (ver bestTripleMix): o espaço
      // de busca cresce ao cubo do tamanho do pool, então mesmo no modo
      // exaustivo isso fica bem mais restrito que o coringa de 2 pernas —
      // só os extremos de float, que é onde a otimização de custo por
      // float-alvo se concentra.
      const tripleCap = exhaustive ? 15 : 5;
      const tripleExtremes = [...lowFloatSorted.slice(0, tripleCap), ...highFloatSorted.slice(0, tripleCap)];

      for (const [collectionTag, byRarity] of menu) {
        const outputs = outputsFor(collectionTag);
        if (!outputs.length) continue;

        const inputs = byRarity.get(tier)?.[stattrak];
        const inputUnits = [];
        for (const s of inputs ?? []) {
          for (const w of s.wears) {
            if (w.priceUsdCents == null) continue;
            inputUnits.push({ skin: s, wear: w });
          }
        }
        // Lembrança pode ser uma das pernas da mistura também (mesma regra
        // do lado uniforme: só entra no Normal, nunca StatTrak).
        if (stattrak === 0) {
          inputUnits.push(...souvenirInputUnits(souvenirMenu, collectionTag, tier));
        }
        if (!inputUnits.length) continue;

        // Baseline pra comparação: a mesma estratégia uniforme (10x a
        // entrada mais barata) de computeSingleCollectionSuggestions.
        const cheapestUnit = inputUnits.reduce((min, u) =>
          u.wear.priceUsdCents < min.wear.priceUsdCents ? u : min
        );
        const baselineCostBrl = (cheapestUnit.wear.priceUsdCents / 100) * rate * 10;
        const baselineAvgFloat = assumedFloatForWear(cheapestUnit.skin, cheapestUnit.wear.exterior);
        const baselineOutcomes = outcomesAcrossGroups(
          new Map([["_", { count: 10, outputs }]]),
          baselineAvgFloat,
          stattrak,
          rate
        );
        const baselineStats = hasVerifiedPrices(baselineOutcomes)
          ? computeContractStats(baselineCostBrl, baselineOutcomes)
          : null;

        const sameCollectionMix =
          inputUnits.length >= 2 ? bestManipulatedMix(inputUnits, outputs, stattrak, rate) : null;
        const crossMix = bestCrossCollectionMix(
          inputUnits,
          collectionTag,
          outputs,
          wildcardPool.filter((u) => u.skin.collectionTag !== collectionTag),
          stattrak,
          rate
        );
        // Trinca: entradas mais baratas da própria coleção + extremos de
        // float de fora, pra tentar combos de até 3 coleções ao mesmo tempo
        // (mais risco, mas às vezes acha um degrau de preço que nenhum par
        // alcança sozinho). Mesmo com o pool bem menor que o do coringa de 2
        // pernas, o custo cúbico é alto demais pra rota síncrona (testado:
        // ~30s contra ~0,2s sem isso) — só roda no job em background.
        const cheapestPrimary = [...inputUnits]
          .sort((a, b) => a.wear.priceUsdCents - b.wear.priceUsdCents)
          .slice(0, 3);
        const tripleCandidates = [
          ...cheapestPrimary,
          ...tripleExtremes.filter((u) => u.skin.collectionTag !== collectionTag),
        ];
        const tripleMix =
          exhaustive && tripleCandidates.length >= 3
            ? bestTripleMix(tripleCandidates, outputsFor, stattrak, rate)
            : null;

        const mix = [sameCollectionMix, crossMix, tripleMix]
          .filter(Boolean)
          .reduce((best, m) => (!best || m.stats.roi > best.stats.roi ? m : best), null);
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
          crossCollection: mix.crossCollection,
          legs: mix.legInfos.map(({ unit, count }) => buildLeg(unit, count, stattrak, rate, collectionNames)),
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
  return { rate, currency, suggestions };
}

// Pra cada raridade (exceto a última) dentro de UMA coleção, devolve as
// possíveis saídas de trade-up (raridade seguinte, mesma coleção, mesmo
// stattrak). Usado pra mostrar "isso aqui pode virar X, Y, Z" item a item na
// listagem de preços — ao contrário de computeSingleCollectionSuggestions,
// não escolhe um input mais barato: quem chama decide o custo (o preço do
// item específico da linha).
export async function getCollectionOutcomeMenu(collectionTag, currency = "usd") {
  const rate = await resolveRate(currency);

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
          const assumedAvgFloat = assumedFloatForWear(inSkin, w.exterior);
          const outcomes = outputSkins
            .map((o) => {
              const predicted = predictOutcomePrice(o, assumedAvgFloat, rate);
              return {
                name: `${o.weapon} | ${o.skin}${o.stattrak ? " (StatTrak™)" : ""}`,
                prob: 100 / outputSkins.length,
                price: predicted.price,
                predictedWear: predicted.wear,
                priceIsEstimate: predicted.priceIsEstimate,
                marketHashName: outcomeMarketHashName(o, predicted.wear, o.stattrak),
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
