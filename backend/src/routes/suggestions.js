import { Router } from "express";
import { computeSingleCollectionSuggestions, computeManipulatedSuggestions } from "../tradeUpEngine.js";
import { getSuggestionCache, saveSuggestionCache } from "../suggestionsCache.js";
import { startManipulatedJob, getManipulatedJobStatus } from "../manipulatedJob.js";
import { recordSuggestionHistory, getSuggestionHistory, getSuggestionHistoryStats } from "../suggestionHistory.js";

export const suggestionsRouter = Router();

function minListingsFrom(req) {
  const value = req.query.minListings;
  if (value == null || value === "") return 10;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 10;
}

function currencyFrom(req) {
  return req.query.currency === "brl" ? "brl" : "usd";
}

suggestionsRouter.get("/", async (req, res) => {
  const minListings = minListingsFrom(req);
  const currency = currencyFrom(req);
  try {
    const result = await computeSingleCollectionSuggestions({ minListings, currency });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Serve o último resultado salvo (instantâneo) se existir — o cálculo
// pesado roda à parte, via job em background (ver /manipulated/refresh).
// Só calcula na hora (bloqueando essa requisição, como antes) se ainda não
// tiver nada salvo — primeira vez que alguém abre a aba antes de qualquer
// refresh ter rodado.
suggestionsRouter.get("/manipulated", async (req, res) => {
  const minListings = minListingsFrom(req);
  const currency = currencyFrom(req);
  const cacheKind = `manipulated_${currency}`;
  try {
    const cached = getSuggestionCache(cacheKind);
    // O cache guarda um único cálculo por moeda. Só é válido quando foi
    // calculado com o mesmo piso de liquidez solicitado; caso contrário,
    // resultados com poucos anúncios poderiam aparecer ao aumentar esse filtro.
    if (cached && cached.minListings === minListings && cached.pricingVersion === "net-strict-v4") {
      return res.json(cached);
    }
    const result = await computeManipulatedSuggestions({ minListings, currency });
    const computedAt = new Date().toISOString();
    saveSuggestionCache(cacheKind, { minListings, exhaustive: false, ...result });
    recordSuggestionHistory({ computedAt, exhaustive: false, suggestions: result.suggestions });
    res.json({
      ...result,
      computedAt,
      minListings,
      exhaustive: false,
      pricingVersion: "net-strict-v4",
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Dispara o recálculo em background (worker thread — não trava a API
// enquanto roda). `exhaustive=1` remove o corte do pool de coringas pra
// todas as raridades, não só Classified/Restricted — pode levar horas,
// mas cabe rodar de um dia pro outro.
suggestionsRouter.post("/manipulated/refresh", (req, res) => {
  const minListings = minListingsFrom(req);
  const currency = currencyFrom(req);
  const exhaustive = req.query.exhaustive === "1" || req.query.exhaustive === "true";
  const status = startManipulatedJob({ minListings, exhaustive, currency });
  res.json(status);
});

suggestionsRouter.get("/manipulated/refresh/status", (req, res) => {
  res.json(getManipulatedJobStatus());
});

// Log permanente de todo contrato "manipulado" já encontrado, em qualquer
// rodada (manual ou exaustiva) — ver suggestionHistory.js. Nunca é limpo
// automaticamente; cada rodada só soma linhas novas.
suggestionsRouter.get("/manipulated/history", (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const sort = ["roi", "bestCaseRoi", "worstCaseRoi", "computedAt"].includes(req.query.sort)
    ? req.query.sort
    : "roi";
  const minRoi = req.query.minRoi !== undefined && req.query.minRoi !== "" ? Number(req.query.minRoi) : null;
  const minBestCaseRoi =
    req.query.minBestCaseRoi !== undefined && req.query.minBestCaseRoi !== "" ? Number(req.query.minBestCaseRoi) : null;
  try {
    const result = getSuggestionHistory({ sort, limit, offset, minRoi, minBestCaseRoi });
    res.json({ ...result, stats: getSuggestionHistoryStats() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
