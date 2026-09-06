import express from "express";
import "./db.js";
import { collectionsRouter } from "./routes/collections.js";
import { itemsRouter } from "./routes/items.js";
import { suggestionsRouter } from "./routes/suggestions.js";
import { skinFloatsRouter } from "./routes/skinFloats.js";

const PORT = process.env.PORT || 8787;

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/collections", collectionsRouter);
app.use("/api/items", itemsRouter);
app.use("/api/suggestions", suggestionsRouter);
app.use("/api/skin-floats", skinFloatsRouter);

app.listen(PORT, () => {
  console.log(`API do Comparador de Trade-Up rodando em http://localhost:${PORT}`);
});
