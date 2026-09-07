import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { outputFloatFromAvg, findBand, requiredAvgForBand, normalizeFloat, denormalizeFloat } from "../lib/floatMath";
import { useI18n } from "../lib/i18n";

const SLOTS = 10;

function bestBandIndex(outcome) {
  if (!outcome) return 0;
  return outcome.wearPrices.reduce(
    (best, b, i) =>
      b.price != null && (best === -1 || b.price > outcome.wearPrices[best].price) ? i : best,
    -1
  );
}

// Recebe `legs` — uma ou mais "pernas" de entrada, cada uma com sua própria
// contagem e faixa de float (útil pro trade-up manipulado, que mistura duas
// skins diferentes). Se só vier `inputFloatRange` (uso antigo, uma skin só
// repetida 10x), monta uma única perna de 10 com aquela faixa.
export default function FloatCalculator({ outcomes, defaultOutcomeName, legs, inputFloatRange }) {
  const { t } = useI18n();
  const resolvedLegs = useMemo(() => {
    if (legs?.length) return legs;
    return [{ count: SLOTS, floatRange: inputFloatRange, label: null }];
  }, [legs, inputFloatRange]);

  const totalSlots = resolvedLegs.reduce((s, l) => s + l.count, 0);

  // "slots" achata as pernas numa lista de SLOT->perna, pra saber com qual
  // faixa de float normalizar cada campo digitado.
  const slotLegs = useMemo(() => {
    const arr = [];
    resolvedLegs.forEach((leg, legIdx) => {
      for (let i = 0; i < leg.count; i++) arr.push(legIdx);
    });
    return arr;
  }, [resolvedLegs]);

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

  const [bandIdx, setBandIdx] = useState(() => bestBandIndex(target));
  const band = target?.wearPrices[bandIdx] ?? target?.wearPrices[0];

  const [showInfo, setShowInfo] = useState(false);
  const [floats, setFloats] = useState(() => Array(totalSlots).fill(""));

  if (!candidateOutcomes.length) {
    return (
      <div style={{ fontSize: 11, color: COLORS.textDim }}>
        {t("None of the possible outputs have float data loaded yet.")}
      </div>
    );
  }

  function selectTarget(idx) {
    setTargetIdx(idx);
    setBandIdx(bestBandIndex(candidateOutcomes[idx]));
  }

  function updateFloat(i, value) {
    const next = floats.slice();
    next[i] = value;
    setFloats(next);
  }

  function legRange(legIdx) {
    const r = resolvedLegs[legIdx]?.floatRange;
    return { min: r?.min ?? 0, max: r?.max ?? 1, has: !!r };
  }

  // Faixa relativa (0–1) que essa perna consegue alcançar de verdade, dado
  // que ela já está travada num wear específico (ex: Field-Tested) — não a
  // faixa 0–1 inteira da skin. Sem isso a calculadora podia pedir um float
  // impossível pra aquele wear (ex: "até 0.07" pra algo que só se compra em
  // Field-Tested, que nunca desce de 0.15).
  function legWearAdjustedRange(legIdx) {
    const leg = resolvedLegs[legIdx];
    const r = legRange(legIdx);
    if (!leg?.wearRange) return { min: 0, max: 1, has: false };
    return {
      min: normalizeFloat(leg.wearRange.min, r.min, r.max),
      max: normalizeFloat(leg.wearRange.max, r.min, r.max),
      has: true,
    };
  }

  // Float digitado usa vírgula decimal (padrão BR) — Number() sozinho não
  // entende "0,04" e retorna NaN, tratando o campo como se estivesse vazio.
  function parseFloatInput(raw) {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    return isNaN(n) ? null : n;
  }

  const parsed = floats.map((f) => parseFloatInput(f));
  const adjusted = parsed.map((v, i) => {
    if (v == null || isNaN(v)) return null;
    const r = legRange(slotLegs[i]);
    return normalizeFloat(v, r.min, r.max);
  });
  const filledCount = adjusted.filter((v) => v != null).length;
  const remaining = totalSlots - filledCount;
  const sumAdjustedFilled = adjusted.reduce((s, v) => s + (v ?? 0), 0);
  const rawFilled = parsed.filter((v) => v != null && !isNaN(v));
  const avgRawFilled = rawFilled.length ? rawFilled.reduce((s, v) => s + v, 0) / rawFilled.length : null;

  const anyMissingRange = resolvedLegs.some((l) => !l.floatRange);

  let resultBlock = null;

  if (target && band) {
    if (remaining === 0) {
      const avgAdjusted = sumAdjustedFilled / totalSlots;
      const outFloat = outputFloatFromAvg(avgAdjusted, target.floatRange.min, target.floatRange.max);
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
          {t("Average relative input float")}: <strong>{fmtFloat(avgAdjusted)}</strong> → {t("predicted output float")}
          : <strong>{fmtFloat(outFloat)}</strong> ({resultBand?.name ?? t("outside any known range")})
          {resultBand?.price != null && <> · {fmtBRL(resultBand.price)}</>}
          {" — "}
          {hitTarget ? t("matches the chosen target.") : t(`doesn't match the target (${band.name}).`)}
        </div>
      );
    } else {
      const required = requiredAvgForBand(
        target.floatRange.min,
        target.floatRange.max,
        band.min,
        band.max
      );
      const requiredAdjustedSumMin = required.min * totalSlots - sumAdjustedFilled;
      const requiredAdjustedSumMax = required.max * totalSlots - sumAdjustedFilled;

      // Quantos slots vazios existem em cada perna (pra mostrar o alvo em
      // float BRUTO — cada perna converte diferente, já que tem sua própria
      // faixa de float).
      const emptyByLeg = new Map();
      floats.forEach((f, i) => {
        if (parseFloatInput(f) != null) return;
        const legIdx = slotLegs[i];
        emptyByLeg.set(legIdx, (emptyByLeg.get(legIdx) ?? 0) + 1);
      });
      const emptyLegEntries = [...emptyByLeg.entries()];

      // O que as pernas restantes CONSEGUEM contribuir de verdade, dado que
      // cada uma já está travada num wear específico — não [0,1] genérico.
      // Sem isso, um wear alvo fora do alcance de TODAS as combinações
      // possíveis (ex: mirar Factory New com uma perna presa em Well-Worn)
      // ainda mostrava um número "válido" pra outra perna, como se desse
      // pra compensar — quando na real não tem combinação nenhuma que feche.
      let achievableMinSum = 0;
      let achievableMaxSum = 0;
      emptyLegEntries.forEach(([legIdx, count]) => {
        const wearAdj = legWearAdjustedRange(legIdx);
        achievableMinSum += count * (wearAdj.has ? wearAdj.min : 0);
        achievableMaxSum += count * (wearAdj.has ? wearAdj.max : 1);
      });
      const jointlyImpossible =
        requiredAdjustedSumMax < achievableMinSum || requiredAdjustedSumMin > achievableMaxSum;

      if (jointlyImpossible) {
        const minOverallAvg = (sumAdjustedFilled + achievableMinSum) / totalSlots;
        const maxOverallAvg = (sumAdjustedFilled + achievableMaxSum) / totalSlots;
        const outA = outputFloatFromAvg(minOverallAvg, target.floatRange.min, target.floatRange.max);
        const outB = outputFloatFromAvg(maxOverallAvg, target.floatRange.min, target.floatRange.max);
        const lo = Math.min(outA, outB);
        const hi = Math.max(outA, outB);
        const reachable = target.wearPrices.filter((b) => b.max >= lo && b.min <= hi);
        resultBlock = (
          <div style={{ marginTop: 8, fontSize: 11, color: COLORS.rust }}>
            {t("With the wears already locked in on the legs (the exact float of each item within them doesn't matter), this mix can only reach an output float between")} <strong>{fmtFloat(lo)}</strong> {t("and")}{" "}
            <strong>{fmtFloat(hi)}</strong> — <strong>{band.name}</strong> {t("is outside that, so changing the target in the selector won't change what you need to type, because no combination closes.")}
            {reachable.length > 0 && (
              <>
                {" "}
                {t("Output(s) this mix can reach")}: <strong>{reachable.map((b) => b.name).join(", ")}</strong>
                . {t('Pick one of these in "Target wear" to see the real numbers, or change a leg\'s wear to open other ranges.')}
              </>
            )}
          </div>
        );
      } else {
        const perRemainingAdjustedMin = requiredAdjustedSumMin / remaining;
        const perRemainingAdjustedMax = requiredAdjustedSumMax / remaining;
        const clampedAdjustedMin = Math.max(0, Math.min(1, perRemainingAdjustedMin));
        const clampedAdjustedMax = Math.max(0, Math.min(1, perRemainingAdjustedMax));

        resultBlock = (
          <div style={{ marginTop: 8, fontSize: 11, color: COLORS.text }}>
            {filledCount > 0 && (
              <div style={{ color: COLORS.textDim, marginBottom: 4 }}>
                {t("Average raw float of the")} {filledCount} {t("filled in")}: <strong>{fmtFloat(avgRawFilled)}</strong>{" "}
                ({t("relative average accounting for each leg's range")}: {fmtFloat(sumAdjustedFilled / (filledCount || 1))})
              </div>
            )}
            {anyMissingRange && (
              <div style={{ color: COLORS.gold, marginBottom: 4 }}>
                {t("One or more legs have no float data — assuming a 0–1 range for them (may be wrong if this skin doesn't cover the whole range).")}
              </div>
            )}
            {t("Missing")} <strong>{remaining}</strong>. {t("To close on")} <strong>{band.name}</strong>:
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {emptyLegEntries.map(([legIdx, count]) => {
                const r = legRange(legIdx);
                const wearAdj = legWearAdjustedRange(legIdx);
                // A perna já está travada num wear específico — cruza o
                // alvo calculado com a faixa REAL que esse wear alcança
                // antes de converter pra float bruto.
                const intersectMin = Math.max(clampedAdjustedMin, wearAdj.min);
                const intersectMax = Math.min(clampedAdjustedMax, wearAdj.max);
                const rawMax = denormalizeFloat(intersectMax, r.min, r.max);
                const rawMin = denormalizeFloat(intersectMin, r.min, r.max);
                const leg = resolvedLegs[legIdx];
                return (
                  <li key={legIdx}>
                    {leg.label ? <strong>{leg.label}</strong> : t("input")} — {count} {t("remaining")}
                    : {t("float up to")} <strong>{fmtFloat(rawMax)}</strong>
                    {intersectMin > wearAdj.min && <> ({t("minimum")} {fmtFloat(rawMin)})</>} {t("each")}
                  </li>
                );
              })}
            </ul>
            {emptyLegEntries.length > 1 && (
              <div style={{ marginTop: 4, color: COLORS.textDim }}>
                {t("The limits above assume the average across the remaining legs stays balanced — you can offset a more worn item on one leg with a newer one on the same or another leg, as long as the overall relative average doesn't exceed the target.")}
              </div>
            )}
          </div>
        );
      }
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
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>{t("Float calculator")}</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <label style={{ fontSize: 10, color: COLORS.textDim }}>{t("Output")}:</label>
        <select
          className="tuc-input"
          style={{ width: "auto", fontSize: 11 }}
          value={targetIdx}
          onChange={(e) => selectTarget(Number(e.target.value))}
        >
          {candidateOutcomes.map((o, i) => (
            <option key={i} value={i}>
              {o.name}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 10, color: COLORS.textDim, marginLeft: 8 }}>{t("Target wear")}:</label>
        <select
          className="tuc-input"
          style={{ width: "auto", fontSize: 11 }}
          value={bandIdx}
          onChange={(e) => setBandIdx(Number(e.target.value))}
        >
          {target?.wearPrices.map((b, i) => (
            <option key={b.name} value={i}>
              {b.name} {b.price != null ? `· ${fmtBRL(b.price)}` : ""}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowInfo((v) => !v)}
          className="tuc-icon-btn"
          title={t("About float ranges")}
          style={{ color: showInfo ? COLORS.gold : COLORS.textDim }}
        >
          <Info size={15} />
        </button>
      </div>

      {showInfo && (
        <div
          style={{
            fontSize: 10,
            color: COLORS.textDim,
            background: COLORS.panelAlt,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: 8,
            marginBottom: 10,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            {t(
              "Float ranges from 0 to 1 and defines the weapon's visual wear: the lower, the newer (Factory New); the higher, the more worn (Battle-Scarred). Each skin has its own min/max — that's why the ranges below are specific to"
            )} <strong>{target?.name}</strong>,{" "}
            {t(
              "not the game's default ranges. What goes into the average isn't the raw float, it's its relative position within each input skin's own range."
            )}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontWeight: 500, paddingBottom: 3 }}>{t("Wear")}</th>
                <th style={{ textAlign: "left", fontWeight: 500, paddingBottom: 3 }}>{t("Float range")}</th>
                <th style={{ textAlign: "left", fontWeight: 500, paddingBottom: 3 }}>{t("Price")}</th>
              </tr>
            </thead>
            <tbody>
              {target?.wearPrices.map((b) => (
                <tr key={b.name} style={{ color: b.name === band?.name ? COLORS.gold : COLORS.textDim }}>
                  <td>{b.name}</td>
                  <td>
                    {fmtFloat(b.min)}–{fmtFloat(b.max)}
                  </td>
                  <td>{b.price != null ? fmtBRL(b.price) : t("no price")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolvedLegs.map((leg, legIdx) => {
        const start = resolvedLegs.slice(0, legIdx).reduce((s, l) => s + l.count, 0);
        const r = legRange(legIdx);
        return (
          <div key={legIdx} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 4 }}>
              {leg.label ? (
                <>
                  <strong style={{ color: COLORS.text }}>{leg.label}</strong> — {t("raw floats (from the inspect link)")}{" "}
                  {r.has && <>— {t("this skin's range")}: {fmtFloat(r.min)}–{fmtFloat(r.max)}</>}
                </>
              ) : (
                <>
                  {t("Raw floats (from the inspect link) of the input items")}
                  {r.has && <> — {t("this skin's range")}: {fmtFloat(r.min)}–{fmtFloat(r.max)}</>}
                </>
              )}{" "}
              ({t("leave blank what you don't know")}):
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {Array.from({ length: leg.count }).map((_, i) => (
                <input
                  key={i}
                  className="tuc-input"
                  style={{ fontSize: 11, padding: "5px 6px" }}
                  placeholder={`#${i + 1}`}
                  value={floats[start + i]}
                  onChange={(e) => updateFloat(start + i, e.target.value)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {resultBlock}
    </div>
  );
}
