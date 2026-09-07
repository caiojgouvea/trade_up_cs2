// Worker thread: roda computeManipulatedSuggestions fora do processo
// principal. É uma conta 100% síncrona (sem await no meio dos loops), então
// rodando no thread principal ela travaria toda a API (health check,
// sincronização de coleções, etc.) pelo tempo todo do cálculo — que no modo
// exaustivo pode ser horas. Abre sua própria conexão com o banco (mesmo
// arquivo, modo WAL) só de leitura.
import { parentPort, workerData } from "node:worker_threads";
import { computeManipulatedSuggestions } from "./tradeUpEngine.js";

async function run() {
  try {
    const { minListings, exhaustive, currency } = workerData;
    const result = await computeManipulatedSuggestions({ minListings, exhaustive, currency });
    parentPort.postMessage({ ok: true, result });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e.message });
  }
}

run();
