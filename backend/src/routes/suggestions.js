import { Router } from "express";
import { computeSingleCollectionSuggestions, computeManipulatedSuggestions } from "../tradeUpEngine.js";

export const suggestionsRouter = Router();

suggestionsRouter.get("/", async (req, res) => {
  const minListings = req.query.minListings ? Number(req.query.minListings) : 10;
  try {
    const result = await computeSingleCollectionSuggestions({ minListings });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

suggestionsRouter.get("/manipulated", async (req, res) => {
  const minListings = req.query.minListings ? Number(req.query.minListings) : 10;
  try {
    const result = await computeManipulatedSuggestions({ minListings });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
