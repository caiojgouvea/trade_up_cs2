import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveSuggestionCache } from "./suggestionsCache.js";
import { recordSuggestionHistory } from "./suggestionHistory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, "manipulatedWorker.js");

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  minListings: null,
  exhaustive: false,
  currency: "usd",
  error: null,
};

export function getManipulatedJobStatus() {
  return { ...state };
}

// Só um de cada vez — o job já é pesado o bastante sem rodar duas cópias
// simultâneas brigando pela CPU.
export function startManipulatedJob({ minListings = 10, exhaustive = false, currency = "usd" } = {}) {
  if (state.running) return getManipulatedJobStatus();

  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.minListings = minListings;
  state.exhaustive = exhaustive;
  state.currency = currency;
  state.error = null;

  const worker = new Worker(WORKER_PATH, { workerData: { minListings, exhaustive, currency } });

  worker.on("message", (msg) => {
    if (msg.ok) {
      saveSuggestionCache(`manipulated_${currency}`, {
        minListings,
        exhaustive,
        rate: msg.result.rate,
        currency,
        suggestions: msg.result.suggestions,
      });
      recordSuggestionHistory({
        computedAt: new Date().toISOString(),
        exhaustive,
        suggestions: msg.result.suggestions,
      });
    } else {
      state.error = msg.error;
    }
  });

  worker.on("error", (e) => {
    state.error = e.message;
  });

  worker.on("exit", () => {
    state.running = false;
    state.finishedAt = new Date().toISOString();
  });

  return getManipulatedJobStatus();
}
