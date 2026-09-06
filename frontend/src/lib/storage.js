const CONTRACTS_KEY = "trade-up-contracts";

export function loadContracts() {
  try {
    const raw = window.localStorage.getItem(CONTRACTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Falha ao carregar contratos:", e);
    return [];
  }
}

export function saveContracts(contracts) {
  try {
    window.localStorage.setItem(CONTRACTS_KEY, JSON.stringify(contracts));
  } catch (e) {
    console.error("Falha ao salvar contratos:", e);
  }
}
