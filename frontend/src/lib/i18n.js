import { useSyncExternalStore } from "react";
import { PT } from "./translations.pt";

const LANG_KEY = "tuc_lang";
const CURRENCY_KEY = "tuc_currency";

function readLang() {
  try {
    return localStorage.getItem(LANG_KEY) || "en";
  } catch {
    return "en";
  }
}

function readCurrency() {
  try {
    return localStorage.getItem(CURRENCY_KEY) || "usd";
  } catch {
    return "usd";
  }
}

let lang = readLang();
let currency = readCurrency();
const listeners = new Set();
function emit() {
  listeners.forEach((fn) => fn());
}

export function getLang() {
  return lang;
}

export function getCurrency() {
  return currency;
}

export function setLang(l) {
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* private browsing / storage disabled */
  }
  emit();
}

export function setCurrency(c) {
  currency = c;
  try {
    localStorage.setItem(CURRENCY_KEY, c);
  } catch {
    /* private browsing / storage disabled */
  }
  emit();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// English is the source of truth: every string written directly in JSX
// is the English (default) copy. translate() only looks up a Portuguese
// replacement when lang === "pt" — untranslated strings just fall back
// to the English original instead of breaking.
export function translate(text, vars) {
  let out = lang === "pt" ? PT[text] || text : text;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

export function useI18n() {
  const snapshot = useSyncExternalStore(subscribe, () => `${lang}|${currency}`);
  const [l, c] = snapshot.split("|");
  return { lang: l, currency: c, setLang, setCurrency, t: translate };
}
