import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { COLORS } from "../lib/colors";
import { fmtBRL, fmtFloat } from "../lib/tradeUpMath";
import { outputFloatFromAvg, findBand, requiredAvgForBand, normalizeFloat, denormalizeFloat } from "../lib/floatMath";

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
        Nenhuma das saídas possíveis tem dado de float carregado ainda.
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
          Float médio relativo de entrada: <strong>{fmtFloat(avgAdjusted)}</strong> → float de saída
          previsto: <strong>{fmtFloat(outFloat)}</strong> ({resultBand?.name ?? "fora de qualquer faixa conhecida"})
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
            Com os wears já travados nas pernas (não importa o float exato de cada item dentro
            deles), essa mistura só alcança float de saída entre <strong>{fmtFloat(lo)}</strong> e{" "}
            <strong>{fmtFloat(hi)}</strong> — <strong>{band.name}</strong> está fora disso, então
            trocar o alvo no seletor não muda o que você precisa digitar, porque nenhuma
            combinação fecha.
            {reachable.length > 0 && (
              <>
                {" "}
                Saída(s) que essa mistura consegue alcançar: <strong>{reachable.map((b) => b.name).join(", ")}</strong>
                . Escolhe um desses no "Wear alvo" pra ver os números reais, ou troca o wear de
                alguma perna pra abrir outras faixas.
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
                Float bruto médio dos {filledCount} preenchido(s): <strong>{fmtFloat(avgRawFilled)}</strong>{" "}
                (média relativa considerando a faixa de cada perna: {fmtFloat(sumAdjustedFilled / (filledCount || 1))})
              </div>
            )}
            {anyMissingRange && (
              <div style={{ color: COLORS.gold, marginBottom: 4 }}>
                Uma ou mais pernas não têm dado de float — assumindo faixa 0–1 pra elas (pode estar
                errado se essa skin não cobrir a faixa toda).
              </div>
            )}
            Faltam <strong>{remaining}</strong>. Pra fechar em <strong>{band.name}</strong>:
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
                    {leg.label ? <strong>{leg.label}</strong> : "entrada"} — {count} restante
                    {count > 1 ? "s" : ""}: float até <strong>{fmtFloat(rawMax)}</strong>
                    {intersectMin > wearAdj.min && <> (mínimo {fmtFloat(rawMin)})</>} cada
                  </li>
                );
              })}
            </ul>
            {emptyLegEntries.length > 1 && (
              <div style={{ marginTop: 4, color: COLORS.textDim }}>
                Os limites acima assumem que a média entre as pernas restantes fica equilibrada —
                dá pra compensar um item mais gasto numa perna com outro mais novo na mesma ou
                outra perna, contanto que a média relativa geral não passe do alvo.
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
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Calculadora de float</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <label style={{ fontSize: 10, color: COLORS.textDim }}>Saída:</label>
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

        <label style={{ fontSize: 10, color: COLORS.textDim, marginLeft: 8 }}>Wear alvo:</label>
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
          title="Sobre as faixas de float"
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
            O float vai de 0 a 1 e define o desgaste visual da arma: quanto mais baixo, mais nova
            (Factory New); quanto mais alto, mais gasta (Battle-Scarred). Cada skin tem seu próprio
            min/max — por isso as faixas abaixo são específicas de <strong>{target?.name}</strong>,
            não as faixas padrão do jogo. O que entra na média não é o float bruto, é a posição
            relativa dele dentro da faixa própria de cada skin de entrada.
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontWeight: 500, paddingBottom: 3 }}>Wear</th>
                <th style={{ textAlign: "left", fontWeight: 500, paddingBottom: 3 }}>Faixa de float</th>
                <th style={{ textAlign: "left", fontWeight: 500, paddingBottom: 3 }}>Preço</th>
              </tr>
            </thead>
            <tbody>
              {target?.wearPrices.map((b) => (
                <tr key={b.name} style={{ color: b.name === band?.name ? COLORS.gold : COLORS.textDim }}>
                  <td>{b.name}</td>
                  <td>
                    {fmtFloat(b.min)}–{fmtFloat(b.max)}
                  </td>
                  <td>{b.price != null ? fmtBRL(b.price) : "sem preço"}</td>
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
                  <strong style={{ color: COLORS.text }}>{leg.label}</strong> — floats brutos (do
                  inspect link) {r.has && <>— faixa dessa skin: {fmtFloat(r.min)}–{fmtFloat(r.max)}</>}
                </>
              ) : (
                <>
                  Floats brutos (do inspect link) dos itens de entrada
                  {r.has && <> — faixa dessa skin: {fmtFloat(r.min)}–{fmtFloat(r.max)}</>}
                </>
              )}{" "}
              (deixe em branco o que não souber):
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
