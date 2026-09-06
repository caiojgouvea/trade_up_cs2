import { useMemo, useState } from "react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { outputFloatFromAvg, findBand, requiredAvgForBand } from "../lib/floatMath";

const SLOTS = 10;

export default function FloatCalculator({ outcomes, defaultOutcomeName }) {
  const candidateOutcomes = useMemo(
    () => outcomes.filter((o) => o.floatRange && o.wearPrices?.length),
    [outcomes]
  );

  const defaultIdx = Math.max(
    0,
    candidateOutcomes.findIndex((o) => o.name === defaultOutcomeName)
  );
  const [targetIdx, setTargetIdx] = useState(defaultIdx === -1 ? 0 : defaultIdx);
  const target = candidateOutcomes[targetIdx];

  const bestBandIdx = target
    ? target.wearPrices.reduce(
        (best, b, i) =>
          b.price != null && (best === -1 || b.price > target.wearPrices[best].price) ? i : best,
        -1
      )
    : -1;
  const [bandIdx, setBandIdx] = useState(bestBandIdx);
  const band = target?.wearPrices[bandIdx] ?? target?.wearPrices[0];

  const [floats, setFloats] = useState(Array(SLOTS).fill(""));

  if (!candidateOutcomes.length) {
    return (
      <div style={{ fontSize: 11, color: COLORS.textDim }}>
        Nenhuma das saídas possíveis tem dado de float carregado ainda.
      </div>
    );
  }

  function updateFloat(i, value) {
    const next = floats.slice();
    next[i] = value;
    setFloats(next);
  }

  const parsed = floats.map((f) => (f.trim() === "" ? null : Number(f)));
  const filled = parsed.filter((v) => v != null && !isNaN(v));
  const filledCount = filled.length;
  const remaining = SLOTS - filledCount;
  const sumFilled = filled.reduce((s, v) => s + v, 0);
  const avgFilled = filledCount > 0 ? sumFilled / filledCount : null;

  let resultBlock = null;

  if (target && band) {
    if (remaining === 0) {
      const avg = sumFilled / SLOTS;
      const outFloat = outputFloatFromAvg(avg, target.floatRange.min, target.floatRange.max);
      const resultBand = findBand(target.wearPrices, outFloat);
      const hitTarget = resultBand?.name === band.name;
      resultBlock = (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: hitTarget ? COLORS.green : COLORS.rust,
          }}
        >
          Float médio de entrada: <strong>{fmtFloat(avg)}</strong> → float de saída previsto:{" "}
          <strong>{fmtFloat(outFloat)}</strong> ({resultBand?.name ?? "fora de qualquer faixa conhecida"})
          {resultBand?.price != null && <> · {fmtBRL(resultBand.price)}</>}
          {" — "}
          {hitTarget ? "bate com o alvo escolhido." : `não bate com o alvo (${band.name}).`}
        </div>
      );
    } else {
      const required = requiredAvgForBand(
        target.floatRange.min,
        target.floatRange.max,
        band.min,
        band.max
      );
      const requiredSumMin = required.min * SLOTS - sumFilled;
      const requiredSumMax = required.max * SLOTS - sumFilled;
      const perRemainingMin = requiredSumMin / remaining;
      const perRemainingMax = requiredSumMax / remaining;
      const clampedMin = Math.max(0, Math.min(1, perRemainingMin));
      const clampedMax = Math.max(0, Math.min(1, perRemainingMax));
      const impossible = perRemainingMax < 0 || perRemainingMin > 1;

      resultBlock = (
        <div style={{ marginTop: 8, fontSize: 11, color: impossible ? COLORS.rust : COLORS.text }}>
          {filledCount > 0 && (
            <div style={{ color: COLORS.textDim, marginBottom: 4 }}>
              Float médio dos {filledCount} preenchido(s): <strong>{fmtFloat(avgFilled)}</strong>{" "}
              (soma até agora: {fmtFloat(sumFilled)})
            </div>
          )}
          {impossible ? (
            <>
              Com os {filledCount} float(s) já preenchidos, não tem como as {remaining} restantes
              (float entre 0 e 1) puxarem a média pra faixa de <strong>{band.name}</strong>.
            </>
          ) : (
            <>
              Faltam <strong>{remaining}</strong>. Pra média cair em{" "}
              <strong>{band.name}</strong> ({fmtFloat(band.min)}–{fmtFloat(band.max)}), a média das
              que faltam precisa ficar entre{" "}
              <strong>
                {fmtFloat(clampedMin)} e {fmtFloat(clampedMax)}
              </strong>
              {remaining === 1 && (
                <> — ou seja, a última precisa ter float entre esses dois valores.</>
              )}
              .
            </>
          )}
        </div>
      );
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 6,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Calculadora de float</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <select
          className="tuc-input"
          style={{ width: "auto", fontSize: 11 }}
          value={targetIdx}
          onChange={(e) => {
            setTargetIdx(Number(e.target.value));
            setBandIdx(-1);
          }}
        >
          {candidateOutcomes.map((o, i) => (
            <option key={i} value={i}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {target?.wearPrices.map((b, i) => (
          <button
            key={b.name}
            onClick={() => setBandIdx(i)}
            className="tuc-btn-ghost"
            style={{
              fontSize: 10,
              padding: "4px 8px",
              borderColor: bandIdx === i ? COLORS.gold : COLORS.border,
              color: bandIdx === i ? COLORS.gold : COLORS.textDim,
            }}
          >
            {b.name} ({fmtFloat(b.min)}–{fmtFloat(b.max)}) {b.price != null ? fmtBRL(b.price) : "—"}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 4 }}>
        Floats que você já tem/pretende comprar (deixe em branco o que não souber):
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {floats.map((f, i) => (
          <input
            key={i}
            className="tuc-input"
            style={{ fontSize: 11, padding: "5px 6px" }}
            placeholder={`#${i + 1}`}
            value={f}
            onChange={(e) => updateFloat(i, e.target.value)}
          />
        ))}
      </div>

      {resultBlock}
    </div>
  );
}
