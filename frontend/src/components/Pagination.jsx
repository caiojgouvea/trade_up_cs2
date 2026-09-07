import { ChevronLeft, ChevronRight } from "lucide-react";
import { COLORS } from "../lib/colors";
import { useI18n } from "../lib/i18n";

export default function Pagination({ page, pageCount, total, pageSize, onPageChange, onPageSizeChange }) {
  const { t } = useI18n();
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
        padding: "10px 12px",
        borderTop: `1px solid ${COLORS.border}`,
        fontSize: 11,
        color: COLORS.textDim,
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <span>
        {from}–{to} {t("of")} {total}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <select
          className="tuc-input"
          style={{ width: 90 }}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {[25, 50, 100, 200].map((size) => (
            <option key={size} value={size}>
              {size}/{t("page")}
            </option>
          ))}
        </select>
        <button
          className="tuc-icon-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label={t("Previous page")}
          style={{ opacity: page <= 1 ? 0.4 : 1 }}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page} / {pageCount}
        </span>
        <button
          className="tuc-icon-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label={t("Next page")}
          style={{ opacity: page >= pageCount ? 0.4 : 1 }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
