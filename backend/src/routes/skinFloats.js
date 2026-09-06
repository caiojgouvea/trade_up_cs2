import { Router } from "express";
import { syncSkinFloats, getSkinFloatsStatus } from "../floatData.js";

export const skinFloatsRouter = Router();

skinFloatsRouter.get("/status", (req, res) => {
  res.json(getSkinFloatsStatus());
});

skinFloatsRouter.post("/sync", async (req, res) => {
  try {
    const result = await syncSkinFloats();
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
