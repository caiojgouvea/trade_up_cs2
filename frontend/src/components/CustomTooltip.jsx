import { COLORS } from "../lib/colors";
import { fmtBRL } from "../lib/tradeUpMath";
import { useI18n } from "../lib/i18n";

export default function CustomTooltip({ active, payload }) {
  const { t } = useI18n();
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
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
      <div>{t("Loss risk")}: {d.probLoss.toFixed(0)}%</div>
      <div>{t("Expected return")}: {d.roi.toFixed(1)}%</div>
      <div>{t("Cost")}: {fmtBRL(d.cost)}</div>
    </div>
  );
}
