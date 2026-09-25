/* ============================================================
   FEATURES/PLANNING/GUIDEDPLANQUESTIONS.TSX — geführter Einstieg im „Neuer
   Plan"-Dialog (Fahrplan 20 E4). Ersetzt im geführten Modus den Level/
   Fokus/Modell-Block: zwei einfache Fragen statt drei Dropdowns, leitet
   Level (levelFromExperience) und Fokus direkt aus den Antworten ab.

   Reine Darstellungs-/Ablauflogik, kein Fetch — Pill-Buttons im selben
   Stil wie die bestehenden Modus-/Wochentag-Pillen in NewPlanDialog.tsx
   (LABEL_STYLE/PILL_STYLE/PRIMARY_BTN_STYLE von dort wiederverwendet statt
   neu erfunden).

   Der angezeigte Modell-Vorschlag ist nur zur Orientierung — suggestModel()
   braucht Wochen/Zeitbudget, die hier (bewusst reine Props: nur onComplete)
   nicht vorliegen; verwendet die defaultFormState()-Richtwerte
   (12 Wochen/6h). Das tatsächliche Modell schlägt NewPlanDialog.tsx nach
   dem Sprung ins Erweitert-Formular ohnehin mit den echten Werten neu vor.
   ============================================================ */

import { useState } from "react";
import { LABEL_STYLE, PILL_STYLE, PRIMARY_BTN_STYLE } from "./new-plan-dialog-styles";
import {
  FOCUS_LABELS,
  levelFromExperience,
  MODEL_LABELS,
  suggestModel,
  type PlanFocus,
  type PlanLevel,
} from "./new-plan-dialog-view-model";

type Experience = "unter1Jahr" | "ueber1Jahr";

const EXPERIENCE_OPTIONS: ReadonlyArray<{ value: Experience; label: string }> = [
  { value: "unter1Jahr", label: "Unter 1 Jahr" },
  { value: "ueber1Jahr", label: "Über 1 Jahr" },
];

const LEVEL_LABELS: Record<PlanLevel, string> = {
  einsteiger: "Einsteiger",
  fortgeschritten: "Fortgeschritten",
};

/** Richtwerte für die illustrative Modell-Empfehlung, s. Kopfkommentar. */
const GUIDED_MODEL_HINT_WEEKS = 12;
const GUIDED_MODEL_HINT_WEEKLY_HOURS = 6;

export interface GuidedPlanQuestionsProps {
  onComplete: (result: { level: PlanLevel; focus: PlanFocus }) => void;
}

export function GuidedPlanQuestions({ onComplete }: GuidedPlanQuestionsProps) {
  const [experience, setExperience] = useState<Experience | null>(null);
  const [focus, setFocus] = useState<PlanFocus | null>(null);

  const level = experience ? levelFromExperience(experience) : null;
  const suggestedModel =
    level != null
      ? suggestModel({
          level,
          weeks: GUIDED_MODEL_HINT_WEEKS,
          weeklyHours: GUIDED_MODEL_HINT_WEEKLY_HOURS,
        })
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={LABEL_STYLE}>
        Wie lange trainierst du schon strukturiert?
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EXPERIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              style={experience === opt.value ? PRIMARY_BTN_STYLE : PILL_STYLE}
              onClick={() => setExperience(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={LABEL_STYLE}>
        Was ist dir am wichtigsten?
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(FOCUS_LABELS) as PlanFocus[]).map((f) => (
            <button
              key={f}
              type="button"
              style={focus === f ? PRIMARY_BTN_STYLE : PILL_STYLE}
              onClick={() => setFocus(f)}
            >
              {FOCUS_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {level != null && focus != null && suggestedModel != null && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--hair)",
            background: "rgba(255,255,255,.04)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span style={{ fontSize: ".78rem", color: "var(--ink-2)" }}>
            Empfehlung: <strong>{LEVEL_LABELS[level]}</strong> · <strong>{FOCUS_LABELS[focus]}</strong>{" "}
            · Modell <strong>{MODEL_LABELS[suggestedModel]}</strong>
          </span>
          <button
            type="button"
            style={{ ...PRIMARY_BTN_STYLE, alignSelf: "flex-start" }}
            onClick={() => onComplete({ level, focus })}
          >
            Übernehmen
          </button>
        </div>
      )}
    </div>
  );
}
