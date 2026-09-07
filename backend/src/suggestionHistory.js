import { db } from "./db.js";

// Grava cada sugestão de uma rodada de "manipulados" como uma linha nova —
// nunca sobrescreve (ver comentário da tabela em db.js). Uma rodada
// exaustiva típica gera centenas de linhas; é intencional, é um log de
// achados ao longo do tempo, não um cache do estado atual.
export function recordSuggestionHistory({ computedAt, exhaustive, suggestions }) {
  const insert = db.prepare(
    `INSERT INTO suggestion_history
       (computed_at, exhaustive, collection_tag, collection_name, tier, next_tier,
        stattrak, cross_collection, leg_count, cost, roi, best_case_roi, worst_case_roi,
        prob_loss, verdict, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of suggestions) {
    insert.run(
      computedAt,
      exhaustive ? 1 : 0,
      s.collectionTag ?? null,
      s.collectionName ?? null,
      s.tier ?? null,
      s.nextTier ?? null,
      s.stattrak ? 1 : 0,
      s.crossCollection ? 1 : 0,
      s.legs?.length ?? null,
      s.cost ?? null,
      s.stats?.roi ?? null,
      s.stats?.bestCaseRoi ?? null,
      s.stats?.worstCaseRoi ?? null,
      s.stats?.probLoss ?? null,
      s.stats?.verdict ?? null,
      JSON.stringify(s)
    );
  }
}

const SORT_COLUMNS = {
  roi: "roi",
  bestCaseRoi: "best_case_roi",
  worstCaseRoi: "worst_case_roi",
  computedAt: "computed_at",
};

export function getSuggestionHistory({ sort = "roi", limit = 50, offset = 0, minRoi = null, minBestCaseRoi = null } = {}) {
  const column = SORT_COLUMNS[sort] ?? "roi";
  const conditions = [];
  const params = [];
  if (minRoi != null) {
    conditions.push("roi >= ?");
    params.push(minRoi);
  }
  if (minBestCaseRoi != null) {
    conditions.push("best_case_roi >= ?");
    params.push(minBestCaseRoi);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = db.prepare(`SELECT COUNT(*) AS n FROM suggestion_history ${where}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM suggestion_history ${where} ORDER BY ${column} DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      computedAt: r.computed_at,
      exhaustive: !!r.exhaustive,
      ...JSON.parse(r.payload),
    })),
  };
}

export function getSuggestionHistoryStats() {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT computed_at) AS runs, COUNT(*) AS entries,
              MIN(computed_at) AS firstAt, MAX(computed_at) AS lastAt
       FROM suggestion_history`
    )
    .get();
  return { runs: row.runs, entries: row.entries, firstAt: row.firstAt, lastAt: row.lastAt };
}
