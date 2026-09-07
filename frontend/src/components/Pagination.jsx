import { ChevronLeft, ChevronRight } from "lucide-react";
import { COLORS } from "../lib/colors";

export default function Pagination({ page, pageCount, total, pageSize, onPageChange, onPageSizeChange }) {
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
        {from}–{to} de {total}
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
              {size}/pág.
            </option>
          ))}
        </select>
        <button
          className="tuc-icon-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
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
          aria-label="Próxima página"
          style={{ opacity: page >= pageCount ? 0.4 : 1 }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
