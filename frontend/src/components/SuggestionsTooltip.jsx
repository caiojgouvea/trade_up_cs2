import { COLORS } from "../lib/colors";
import { fmtBRL } from "../lib/tradeUpMath";

export default function SuggestionsTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: COLORS.panelAlt,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: "10px 12px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        color: COLORS.text,
        maxWidth: 240,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
      <div>Risco de perda: {d.probLoss.toFixed(0)}%</div>
      <div>Retorno esperado: {d.roi.toFixed(1)}%</div>
      <div>Custo (10x): {fmtBRL(d.cost)}</div>
    </div>
  );
}
