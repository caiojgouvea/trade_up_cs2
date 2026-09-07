import { useEffect, useMemo, useState } from "react";
import { RotateCcw, RefreshCw, Search, Star } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat, computeStats } from "../lib/tradeUpMath";
import { loadFavorites, saveFavorites } from "../lib/favorites";
import { useI18n } from "../lib/i18n";
import ItemThumb from "./ItemThumb";
import {
  getCollections,
  syncCollections,
  refreshCollection,
  getCollectionItems,
  getExactPrice,
} from "../lib/api";

function wearLabel(o, t) {
  if (!o.predictedWear) return t("average across wears");
  return o.priceIsEstimate ? `${o.predictedWear}, ${t("estimated")}` : o.predictedWear;
}

export default function CollectionsExplorer() {
  const { t, currency } = useI18n();
  const priceField = currency === "brl" ? "priceBrlEstimate" : "priceUsd";
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);

  const [items, setItems] = useState([]);
  const [rate, setRate] = useState(null);
  const [outcomeMenu, setOutcomeMenu] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [itemFilter, setItemFilter] = useState("");
  const [sort, setSort] = useState({ key: priceField, dir: "desc" });
  const [exactLoadingHash, setExactLoadingHash] = useState(null);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState(() => loadFavorites());

  function toggleFavorite(hash) {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(hash) ? next.delete(hash) : next.add(hash);
      saveFavorites(next);
      return next;
    });
  }

  useEffect(() => {
    loadCollections();
  }, []);

  useEffect(() => {
    if (selectedTag) loadItems(selectedTag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  async function loadCollections() {
    setCollectionsLoading(true);
    setError("");
    try {
      setCollections(await getCollections());
    } catch (e) {
      setError(e.message);
    } finally {
      setCollectionsLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      await syncCollections();
      await loadCollections();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function selectCollection(tag) {
    setSelectedTag(tag);
    setItems([]);
    setItemFilter("");
    await loadItems(tag);
  }

  async function loadItems(tag) {
    setItemsLoading(true);
    setError("");
    try {
      const data = await getCollectionItems(tag, currency);
      setItems(data.items);
      setRate(data.rate);
      setOutcomeMenu(data.outcomeMenu || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setItemsLoading(false);
    }
  }

  async function handleRefreshItems() {
    if (!selectedTag) return;
    setRefreshing(true);
    setError("");
    try {
      await refreshCollection(selectedTag);
      await loadItems(selectedTag);
      await loadCollections();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleExactPrice(hash) {
    setExactLoadingHash(hash);
    setError("");
    try {
      const exact = await getExactPrice(hash);
      setItems((prev) =>
        prev.map((it) =>
          it.market_hash_name === hash
            ? { ...it, price_brl_exact: exact?.lowestPrice ?? it.price_brl_exact }
            : it
        )
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setExactLoadingHash(null);
    }
  }

  function toggleSort(key) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  }

  const filteredCollections = useMemo(() => {
    const q = collectionFilter.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.name.toLowerCase().includes(q));
  }, [collections, collectionFilter]);

  const visibleItems = useMemo(() => {
    const q = itemFilter.trim().toLowerCase();
    let rows = items;
    if (q) {
      rows = rows.filter(
        (it) =>
          it.weapon?.toLowerCase().includes(q) ||
          it.skin?.toLowerCase().includes(q) ||
          it.market_hash_name.toLowerCase().includes(q)
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const aFav = favorites.has(a.market_hash_name);
      const bFav = favorites.has(b.market_hash_name);
      if (aFav !== bFav) return aFav ? -1 : 1;

      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
  }, [items, itemFilter, sort, favorites]);

  const selectedCollection = collections.find((c) => c.tag === selectedTag);

  function tradeUpPreview(item) {
    const tierInfo = outcomeMenu[item.rarity];
    if (!tierInfo || item[priceField] == null) return null;

    // Prevê o wear real de cada saída assumindo que você compra ESSE wear
    // específico (não a média entre wears) — cai pra média só se faltar
    // dado de float pra esse item exato.
    const perInput = item.stattrak ? tierInfo.perInputStattrak : tierInfo.perInputNormal;
    const key = `${item.weapon}|${item.skin}|${item.exterior}`;
    const exact = perInput?.[key];
    const outcomes = exact?.outcomes ?? (item.stattrak ? tierInfo.stattrak : tierInfo.normal);
    if (!outcomes || outcomes.length === 0) return null;

    const stats = computeStats({ cost: item[priceField] * 10, outcomes });
    const bestOutcome = item.stattrak ? tierInfo.bestOutcomeStattrak : tierInfo.bestOutcomeNormal;
    return {
      stats,
      outcomes,
      nextTier: tierInfo.nextTier,
      bestOutcome,
      assumedAvgFloat: exact?.assumedAvgFloat ?? null,
    };
  }

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100%",
        color: COLORS.text,
        fontFamily: "'Space Grotesk', sans-serif",
        padding: "28px 20px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "min(1800px, 96vw)", margin: "0 auto 24px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t("Collections & Prices")}</h1>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6, maxWidth: 640 }}>
          {t(
            "Prices come from the Steam Community Market. The bulk listing uses an estimated price (USD, converted to the selected currency at the day's rate); the exact BRL price of a specific item can be checked on demand."
          )}
        </p>
      </div>

      <div style={{ maxWidth: "min(1800px, 96vw)", margin: "0 auto", display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
        {/* COLLECTIONS LIST */}
        <div
          style={{
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: 16,
            alignSelf: "start",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{t("Collections")}</div>

          {collections.length === 0 && !collectionsLoading ? (
            <button className="tuc-btn" style={{ width: "100%" }} onClick={handleSync} disabled={syncing}>
              {syncing ? t("Syncing...") : t("Sync list from Steam")}
            </button>
          ) : (
            <>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  className="tuc-input"
                  placeholder={t("Filter collections...")}
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                />
              </div>
              <button
                className="tuc-btn-ghost"
                style={{ width: "100%", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12 }}
                onClick={handleSync}
                disabled={syncing}
              >
                <RotateCcw size={13} /> {syncing ? t("Syncing...") : t("Re-sync list")}
              </button>
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                {collectionsLoading ? (
                  <div style={{ color: COLORS.textDim, fontSize: 12 }}>{t("Loading...")}</div>
                ) : (
                  filteredCollections.map((c) => (
                    <div
                      key={c.tag}
                      onClick={() => selectCollection(c.tag)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 5,
                        cursor: "pointer",
                        fontSize: 12,
                        marginBottom: 3,
                        background: selectedTag === c.tag ? COLORS.panelAlt : "transparent",
                        border: `1px solid ${selectedTag === c.tag ? COLORS.gold : "transparent"}`,
                        color: selectedTag === c.tag ? COLORS.text : COLORS.textDim,
                      }}
                    >
                      <div>{c.name}</div>
                      {c.synced_at && (
                        <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>
                          {c.total_count} {t("items")} · {t("updated")} {new Date(c.synced_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* ITEMS */}
        <div>
          {error && (
            <div
              style={{
                background: COLORS.panel,
                border: `1px solid ${COLORS.rust}`,
                color: COLORS.rust,
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          {!selectedTag ? (
            <div
              style={{
                background: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: 30,
                textAlign: "center",
                color: COLORS.textDim,
                fontSize: 13,
              }}
            >
              {t("Pick a collection from the list on the side.")}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedCollection?.name}</div>
                  {rate != null && currency === "brl" && (
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>
                      {t("Rate used")}: 1 USD ≈ {fmtBRL(rate)}
                    </div>
                  )}
                </div>
                <button
                  className="tuc-btn"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={handleRefreshItems}
                  disabled={refreshing}
                >
                  <RefreshCw size={13} className={refreshing ? "tuc-spin" : ""} />
                  {refreshing ? t("Fetching from Steam...") : t("Fetch/update prices")}
                </button>
              </div>

              {itemsLoading ? (
                <div style={{ color: COLORS.textDim, fontSize: 13 }}>{t("Loading...")}</div>
              ) : items.length === 0 ? (
                <div
                  style={{
                    background: COLORS.panel,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: 30,
                    textAlign: "center",
                    color: COLORS.textDim,
                    fontSize: 13,
                  }}
                >
                  {t(
                    'No cached items yet for this collection. Click "Fetch/update prices" (this paginates the Steam Market slowly on purpose to avoid rate limiting — can take a few seconds up to 1 minute for large collections).'
                  )}
                </div>
              ) : (
                <div
                  style={{
                    background: COLORS.panel,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}` }}>
                    <div style={{ position: "relative" }}>
                      <Search
                        size={13}
                        color={COLORS.textDim}
                        style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                      />
                      <input
                        className="tuc-input"
                        style={{ paddingLeft: 30 }}
                        placeholder={t("Filter by weapon or skin...")}
                        value={itemFilter}
                        onChange={(e) => setItemFilter(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tuc-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th></th>
                          <th style={{ cursor: "pointer" }} onClick={() => toggleSort("weapon")}>{t("Weapon")}</th>
                          <th style={{ cursor: "pointer" }} onClick={() => toggleSort("skin")}>{t("Skin")}</th>
                          <th>{t("Exterior")}</th>
                          <th>ST</th>
                          <th style={{ cursor: "pointer" }} onClick={() => toggleSort(priceField)}>
                            {t("Est. price")} ({currency === "brl" ? "BRL" : "USD"})
                          </th>
                          <th>{t("Exact price")} (BRL)</th>
                          <th style={{ cursor: "pointer" }} onClick={() => toggleSort("sell_listings")}>
                            {t("Active listings")}
                          </th>
                          <th>{t("Trade-up (10x of this item)")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleItems.map((it) => {
                          const preview = tradeUpPreview(it);
                          return (
                          <tr key={it.market_hash_name}>
                            <td>
                              <button
                                className="tuc-icon-btn"
                                onClick={() => toggleFavorite(it.market_hash_name)}
                                aria-label={t("Favorite")}
                                style={{ color: favorites.has(it.market_hash_name) ? COLORS.gold : COLORS.textDim }}
                              >
                                <Star size={15} fill={favorites.has(it.market_hash_name) ? COLORS.gold : "none"} />
                              </button>
                            </td>
                            <td>
                              <ItemThumb iconUrl={it.icon_url} rarity={it.rarity} size={32} />
                            </td>
                            <td>{it.weapon}</td>
                            <td>{it.skin || "—"}</td>
                            <td style={{ fontSize: 11, color: COLORS.textDim }}>{it.exterior || "—"}</td>
                            <td style={{ color: it.stattrak ? COLORS.gold : COLORS.textDim, fontSize: 11 }}>
                              {it.stattrak ? "ST" : "—"}
                            </td>
                            <td>{it[priceField] != null ? fmtBRL(it[priceField]) : "—"}</td>
                            <td>
                              {it.price_brl_exact != null ? (
                                <span style={{ color: COLORS.green }}>R$ {it.price_brl_exact.toFixed(2)}</span>
                              ) : (
                                <button
                                  className="tuc-btn-ghost"
                                  style={{ fontSize: 11, padding: "4px 8px" }}
                                  onClick={() => handleExactPrice(it.market_hash_name)}
                                  disabled={exactLoadingHash === it.market_hash_name}
                                >
                                  {exactLoadingHash === it.market_hash_name ? "..." : t("check")}
                                </button>
                              )}
                            </td>
                            <td style={{ fontSize: 11, color: COLORS.textDim }}>{it.sell_listings ?? "—"}</td>
                            <td style={{ fontSize: 11, minWidth: 200 }}>
                              {!preview ? (
                                <span style={{ color: COLORS.textDim }}>—</span>
                              ) : (
                                <div
                                  title={`${t("Becomes")} (${preview.nextTier}): ${preview.outcomes
                                    .map((o) => `${o.name} (${wearLabel(o, t)}) · ${fmtBRL(o.price)}`)
                                    .join(" | ")}`}
                                >
                                  <span style={{ color: preview.stats.verdictColor, fontWeight: 600 }}>
                                    {preview.stats.roi >= 0 ? "+" : ""}
                                    {preview.stats.roi.toFixed(0)}%
                                  </span>
                                  <span style={{ color: COLORS.textDim }}>
                                    {" "}
                                    · {t("risk")} {preview.stats.probLoss.toFixed(0)}%
                                  </span>
                                  {preview.assumedAvgFloat != null && (
                                    <span style={{ color: COLORS.textDim, fontSize: 10 }}>
                                      {" "}
                                      · float ~{fmtFloat(preview.assumedAvgFloat)}
                                    </span>
                                  )}
                                  <div
                                    style={{
                                      color: COLORS.textDim,
                                      marginTop: 2,
                                      maxWidth: 240,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    →{" "}
                                    {preview.outcomes.map((o) => `${o.name} (${wearLabel(o, t)})`).join(", ")}
                                  </div>
                                  {preview.bestOutcome && (
                                    <div style={{ color: COLORS.textDim, marginTop: 2, fontSize: 10 }}>
                                      {t("Best output")}: {preview.bestOutcome.name} ({preview.bestOutcome.wear}) ·
                                      {t("float between")} {fmtFloat(preview.bestOutcome.requiredAvgFloatMin)}–
                                      {fmtFloat(preview.bestOutcome.requiredAvgFloatMax)}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
