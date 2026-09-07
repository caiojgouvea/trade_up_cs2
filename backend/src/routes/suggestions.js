import { Router } from "express";
import { computeSingleCollectionSuggestions, computeManipulatedSuggestions } from "../tradeUpEngine.js";
import { getSuggestionCache, saveSuggestionCache } from "../suggestionsCache.js";
import { startManipulatedJob, getManipulatedJobStatus } from "../manipulatedJob.js";

export const suggestionsRouter = Router();

function minListingsFrom(req) {
  const value = req.query.minListings;
  if (value == null || value === "") return 10;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 10;
}

suggestionsRouter.get("/", async (req, res) => {
  const minListings = minListingsFrom(req);
  try {
    const result = await computeSingleCollectionSuggestions({ minListings });
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
  try {
    const cached = getSuggestionCache("manipulated");
    // O cache guarda um único cálculo. Só é válido quando foi calculado
    // com o mesmo piso de liquidez solicitado; caso contrário, resultados
    // com poucos anúncios poderiam aparecer ao aumentar esse filtro.
    if (cached && cached.minListings === minListings && cached.pricingVersion === "net-strict-v2") {
      return res.json(cached);
    }
    const result = await computeManipulatedSuggestions({ minListings });
    saveSuggestionCache("manipulated", { minListings, exhaustive: false, ...result });
    res.json({
      ...result,
      computedAt: new Date().toISOString(),
      minListings,
      exhaustive: false,
      pricingVersion: "net-strict-v2",
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
  const exhaustive = req.query.exhaustive === "1" || req.query.exhaustive === "true";
  const status = startManipulatedJob({ minListings, exhaustive });
  res.json(status);
});

suggestionsRouter.get("/manipulated/refresh/status", (req, res) => {
  res.json(getManipulatedJobStatus());
});
