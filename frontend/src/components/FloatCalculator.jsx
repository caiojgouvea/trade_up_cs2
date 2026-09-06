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

export default function FloatCalculator({ outcomes, defaultOutcomeName, inputFloatRange }) {
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
  const [floats, setFloats] = useState(Array(SLOTS).fill(""));

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

  // O float que a fórmula de trade-up usa é a posição RELATIVA (0–1) dentro
  // da faixa própria da skin de ENTRADA, não o float bruto que você vê no
  // inspect link. Sem essa faixa, a conta fica errada pra qualquer skin cujo
  // min/max não seja 0–1 inteiro (a maioria não é) — foi exatamente esse bug
  // que causou um "10x Factory New" virar Minimal Wear na prática.
  const hasInputRange = !!inputFloatRange;
  const inMin = inputFloatRange?.min ?? 0;
  const inMax = inputFloatRange?.max ?? 1;

  const parsed = floats.map((f) => (f.trim() === "" ? null : Number(f)));
  const filled = parsed.filter((v) => v != null && !isNaN(v));
  const filledCount = filled.length;
  const remaining = SLOTS - filledCount;
  const sumFilled = filled.reduce((s, v) => s + v, 0);
  const avgFilled = filledCount > 0 ? sumFilled / filledCount : null;
  const adjustedFilled = filled.map((v) => normalizeFloat(v, inMin, inMax));
  const sumAdjustedFilled = adjustedFilled.reduce((s, v) => s + v, 0);

  let resultBlock = null;

  if (target && band) {
    if (remaining === 0) {
      const avgAdjusted = sumAdjustedFilled / SLOTS;
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
          Float médio de entrada: <strong>{fmtFloat(avgFilled)}</strong>
          {hasInputRange && (
            <>
              {" "}
              (posição relativa <strong>{fmtFloat(avgAdjusted)}</strong> dentro da faixa {fmtFloat(inMin)}–
              {fmtFloat(inMax)} dessa skin de entrada)
            </>
          )}{" "}
          → float de saída previsto: <strong>{fmtFloat(outFloat)}</strong> (
          {resultBand?.name ?? "fora de qualquer faixa conhecida"})
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
      const requiredAdjustedSumMin = required.min * SLOTS - sumAdjustedFilled;
      const requiredAdjustedSumMax = required.max * SLOTS - sumAdjustedFilled;
      const perRemainingAdjustedMin = requiredAdjustedSumMin / remaining;
      const perRemainingAdjustedMax = requiredAdjustedSumMax / remaining;
      const clampedAdjustedMin = Math.max(0, Math.min(1, perRemainingAdjustedMin));
      const clampedAdjustedMax = Math.max(0, Math.min(1, perRemainingAdjustedMax));
      const impossible = perRemainingAdjustedMax < 0 || perRemainingAdjustedMin > 1;

      // Mostra em float BRUTO (o que dá pra conferir num inspect link real),
      // convertendo de volta da posição relativa pra faixa da skin de entrada.
      const clampedRawMin = denormalizeFloat(clampedAdjustedMin, inMin, inMax);
      const clampedRawMax = denormalizeFloat(clampedAdjustedMax, inMin, inMax);

      resultBlock = (
        <div style={{ marginTop: 8, fontSize: 11, color: impossible ? COLORS.rust : COLORS.text }}>
          {filledCount > 0 && (
            <div style={{ color: COLORS.textDim, marginBottom: 4 }}>
              Float médio dos {filledCount} preenchido(s): <strong>{fmtFloat(avgFilled)}</strong>{" "}
              (soma até agora: {fmtFloat(sumFilled)})
            </div>
          )}
          {!hasInputRange && (
            <div style={{ color: COLORS.gold, marginBottom: 4 }}>
              Sem dado de float da skin de entrada — assumindo faixa 0–1 (pode estar errado se essa
              skin não cobrir a faixa toda).
            </div>
          )}
          {impossible ? (
            <>
              Com os {filledCount} float(s) já preenchidos, não tem como as {remaining} restantes
              (float entre {fmtFloat(inMin)} e {fmtFloat(inMax)} pra essa skin) puxarem a média pra
              faixa de <strong>{band.name}</strong>.
            </>
          ) : remaining === 1 ? (
            <>
              Falta <strong>1</strong>. Pra fechar em <strong>{band.name}</strong>, essa última
              precisa ter float até <strong>{fmtFloat(clampedRawMax)}</strong>
              {clampedAdjustedMin > 0 && <> (e no mínimo {fmtFloat(clampedRawMin)})</>}.
            </>
          ) : (
            <>
              Faltam <strong>{remaining}</strong>. Pra fechar em <strong>{band.name}</strong>, dá
              pra usar float até <strong>{fmtFloat(clampedRawMax)}</strong> em cada uma das que faltam
              {clampedAdjustedMin > 0 && <> (mínimo {fmtFloat(clampedRawMin)} cada)</>} — pode
              misturar valores diferentes, contanto que a média delas não passe disso.
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
            não as faixas padrão do jogo.
          </div>
          {hasInputRange && (
            <div style={{ marginBottom: 6 }}>
              A skin de entrada que você compraria tem faixa própria <strong>{fmtFloat(inMin)}–
              {fmtFloat(inMax)}</strong>: digite o float bruto de cada item (o número real do inspect
              link) — a calculadora converte pra posição relativa dentro dessa faixa antes de
              calcular a média, porque é assim que o jogo calcula, não com o float bruto direto.
            </div>
          )}
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

      <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 4 }}>
        Floats brutos (do inspect link) dos itens de entrada que você já tem/pretende comprar
        {hasInputRange && <> — faixa dessa skin: {fmtFloat(inMin)}–{fmtFloat(inMax)}</>} (deixe em
        branco o que não souber):
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
