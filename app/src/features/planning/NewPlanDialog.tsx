/* ============================================================
   FEATURES/PLANNING/NEWPLANDIALOG.TSX — „Neuer Plan"-Dialog (Fahrplan 8 E5)

   Formular für die Rahmenbedingungen + Vorschau der erzeugten
   Wochenstruktur. E5 SCHREIBT NOCH NICHT: „Übernehmen" ist deaktiviert
   (scharf ab E6, `useCreateTrainingPlan`). Alles Reine (Formular →
   `PlanGeneratorInput`, Validierung, Modell-Vorschlag) liegt in
   new-plan-dialog-view-model.ts; die Wochenübersicht in PlanPreview.tsx.

   Overlay-Muster wie ShiftPlanDialog.tsx (`useEscapeToClose`, Klick daneben).

   FTP-Ziel (Entscheidung 11): wird das Feld leer gelassen, leitet der
   Generator selbst einen Wert ab (`plan.ftpTarget`, Linearprojektion). Als
   Orientierung zeigt das Feld die Retest-Prognose (`forecastFtp` auf das
   Plan-Ende) als Platzhalter; ein gewähltes Event mit `ftpGoal` füllt das
   Feld vor. Eine tiefere Verzahnung (Prognose als echter Default) bleibt
   einer späteren Etappe überlassen.
   ============================================================ */

import { useMemo, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useEvents } from "../../api/hooks/useEvents";
import { useRides } from "../../api/hooks/useRides";
import { useEffectiveSport } from "../../api/hooks/useActiveSport";
import { usePlanHistoryAggregate } from "../../api/hooks/usePlanHistoryAggregate";
import { useAthleteFormats } from "../../api/hooks/useAthleteFormats";
import { useActiveTrainingPlan } from "../../api/hooks/useActiveTrainingPlan";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useSessionProfile } from "../../api/hooks/useSession";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useFtpHistory } from "../../api/hooks/useFtpHistory";
import { useCreateTrainingPlan } from "./useCreateTrainingPlan";
import { athleteConfig } from "../../config";
import { localISODate, addDaysISO, diffDays, fmtDate } from "../../core/format.js";
import { generatePlan } from "../../core/plan-generator.js";
import { eftpHistory, forecastFtp } from "../../core/ftp-forecast.js";
import { PlanPreview } from "./PlanPreview";
import { ModelBlockBar } from "./ModelBlockBar";
import { MiniPlanPreview } from "./MiniPlanPreview";
import { GuidedPlanQuestions } from "./GuidedPlanQuestions";
import { CompareModelsDialog } from "./CompareModelsDialog";
import {
  AVAILABLE_MODELS,
  buildGeneratorInput,
  defaultFormState,
  FOCUS_DESCRIPTIONS,
  FOCUS_LABELS,
  FIXED_DAY_TYPES,
  FIXED_INTERVAL_TYP,
  LEVEL_DESCRIPTIONS,
  MODEL_BLOCK_SHARES,
  MODEL_DESCRIPTIONS,
  MODEL_LABELS,
  mondayOf,
  parseDescriptionSegments,
  resolveMeasuredFtp,
  suggestModel,
  WEEKDAY_LABELS,
  type FixedDay,
  type GeneratedPlan,
  type NewPlanFormState,
  type PlanFocus,
  type PlanGeneratorInput,
  type PlanLevel,
  type PlanModel,
} from "./new-plan-dialog-view-model";
import { BTN_STYLE, LABEL_STYLE, PILL_STYLE, PRIMARY_BTN_STYLE } from "./new-plan-dialog-styles";

/** Vorschau + der Input/Formularstand, aus dem sie erzeugt wurde — im selben
 *  Zug übernommen, damit die geschriebene `training_plans`-Zeile (params,
 *  Modell) exakt zu den geschriebenen Karten passt, auch wenn Historie/Events
 *  zwischen „Vorschau" und „Übernehmen" nachladen. */
interface PreviewBundle {
  plan: GeneratedPlan;
  input: PlanGeneratorInput;
  form: NewPlanFormState;
}

type Ride = import("../../types.js").Ride;

interface NewPlanDialogProps {
  athleteId: string;
  onClose: () => void;
}

const NEW_EVENT_VALUE = "__new__";

const FIELD_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "7px 9px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".82rem",
  width: "100%",
  boxSizing: "border-box",
};

export function NewPlanDialog({ athleteId, onClose }: NewPlanDialogProps) {
  useEscapeToClose(onClose);

  const today = localISODate();
  const cfg = athleteConfig(athleteId);
  const { effectiveSport } = useEffectiveSport(athleteId);
  const { data: events } = useEvents(athleteId);
  const { data: rideData } = useRides(athleteId);
  const { aggregate } = usePlanHistoryAggregate(athleteId, effectiveSport);
  const { entries: formatEntries } = useAthleteFormats();
  const { data: activePlan } = useActiveTrainingPlan(athleteId);
  const { data: existingCards } = usePlanCards(athleteId);
  const profile = useSessionProfile();
  const { createPlan, isPending: saving } = useCreateTrainingPlan(athleteId);
  const { isSelf, isLoading: isSelfLoading } = useIsSelfAthlete(athleteId);
  // useFtpHistory() liest owner-only per RLS immer die Historie des
  // EINGELOGGTEN Users — nur bei isSelf gehört sie also zu diesem Athleten.
  // Für den Trainer-für-Athlet-Fall liefert der ohnehin geladene rideData
  // dieselbe Historie öffentlich/read-only aus der JSON-Pipeline (analog
  // HeroPage.tsx::ftpHistoryEntries). Solange isSelf selbst noch lädt: leer
  // lassen statt zwischenzeitlich die falsche Quelle zu ziehen — sonst
  // flippt ftpHistoryEntries einmal beim Laden und noch einmal, sobald
  // isSelf feststeht, und würde dazwischen unbemerkt eine schon erzeugte
  // Vorschau verwerfen (patch() unten).
  const { entries: ownFtpHistoryEntries } = useFtpHistory();
  const ftpHistoryEntries = isSelfLoading
    ? []
    : isSelf
      ? ownFtpHistoryEntries
      : (rideData?.ftpHistory ?? []);

  const [form, setForm] = useState<NewPlanFormState>(() =>
    defaultFormState(cfg, today, ftpHistoryEntries)
  );
  const [guidedMode, setGuidedMode] = useState(true);
  const [modelTouched, setModelTouched] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [ftpTouched, setFtpTouched] = useState(false);
  const [preview, setPreview] = useState<PreviewBundle | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // FTP-Historie lädt asynchron — beim allerersten Render greift der
  // Startzustand oben (defaultFormState()) meist nur auf den config.ts-
  // Fallback zurück. Sobald echte Daten da sind, hier nachziehen. State-
  // Anpassung WÄHREND des Renders statt in einem Effect (wie bei
  // prefilledSpeed unten) — sonst react-hooks/set-state-in-effect. Vergleich
  // direkt gegen `form` (nicht gegen eine eigene Merkvariable) — erkennt so
  // auch eine Datumsänderung bei gleichem Watt-Wert und braucht keinen
  // zusätzlichen State. Nur solange der Athlet das FTP-Feld nicht selbst
  // angefasst hat. patch() statt setForm(), obwohl das hier kein Nutzer-
  // Tastendruck ist: eine schon erzeugte Vorschau (preview) muss verfallen,
  // sonst zeigt das Feld die neue FTP, während "Übernehmen" noch die alte
  // speichert.
  const measuredFtp = resolveMeasuredFtp(cfg, ftpHistoryEntries, today);
  if (
    measuredFtp.ftpMeasured != null &&
    !ftpTouched &&
    (measuredFtp.ftpMeasured !== form.currentFtp ||
      measuredFtp.ftpMeasuredDate !== form.ftpMeasuredDate)
  ) {
    patch({ currentFtp: measuredFtp.ftpMeasured, ftpMeasuredDate: measuredFtp.ftpMeasuredDate });
  }

  // „Übernehmen" ersetzt künftige Karten, sobald es welche gibt — ein aktiver
  // erzeugter Plan ODER noch-geplante Vorlagen-/Handkarten ab heute. Bestimmt
  // Warnhinweis + Knopfbeschriftung.
  const willReplace = useMemo(
    () => !!activePlan || (existingCards ?? []).some((c) => c.date >= today && !c.cancelled),
    [activePlan, existingCards, today]
  );

  function patch(next: Partial<NewPlanFormState>) {
    setForm((f) => ({ ...f, ...next }));
    setPreview(null); // Vorschau ist mit der Formularänderung veraltet
    setSaveError(null);
  }

  // Event-Dropdown: Rennen mit Priorität zuerst (Entscheidung 4), dann nach
  // Datum. NICHT nach Startdatum gefiltert — ein Event vor dem Start bleibt
  // wählbar und wird erst in buildGeneratorInput() als Fehler gemeldet (sonst
  // verschwände die gerade gewählte Zeile beim Datumsschieben und der Select
  // zeigte eine falsche Auswahl).
  const eventOptions = useMemo(() => {
    const rank = (p: string | null) => (p === "main" ? 0 : p === "secondary" ? 1 : 2);
    return [...(events ?? [])].sort(
      (a, b) => rank(a.priority) - rank(b.priority) || a.eventDate.localeCompare(b.eventDate)
    );
  }, [events]);

  const resolveEventDate = (id: string) => eventOptions.find((e) => e.id === id)?.eventDate ?? null;

  // Wirksame Planlänge für den Modell-Vorschlag: im event-Modus aus
  // start..Renntag abgeleitet (das Wochen-Feld existiert dort nicht und bliebe
  // auf dem open-Default hängen — Review-Fund).
  const effWeeks = useMemo(() => {
    if (form.mode !== "event") return form.weeks;
    const end = form.eventId ? resolveEventDate(form.eventId) : form.newEventDate || null;
    if (!end) return form.weeks;
    return Math.max(1, Math.ceil((diffDays(end, mondayOf(form.startDate)) + 1) / 7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.mode, form.weeks, form.eventId, form.newEventDate, form.startDate, eventOptions]);

  // Retest-Prognose als Platzhalter im FTP-Ziel-Feld — nur Rad (Fahrplan 14
  // Nicht-Ziel: keine Fortschrittsprognose für Lauf/Schwimm-Schwellenpace).
  const forecastHint = useMemo(() => {
    if (effectiveSport !== "ride") return null;
    const rides = (rideData?.rides as Ride[] | undefined) ?? [];
    const endISO =
      form.mode === "event"
        ? form.eventId
          ? resolveEventDate(form.eventId)
          : form.newEventDate || null
        : addDaysISO(mondayOf(form.startDate), form.weeks * 7);
    if (!endISO) return null;
    const fc = forecastFtp(eftpHistory(rides), endISO);
    return fc ? Math.round(fc.projected) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveSport,
    rideData,
    form.mode,
    form.eventId,
    form.newEventDate,
    form.startDate,
    form.weeks,
    eventOptions,
  ]);

  // Schwellenpace vorbefüllen, sobald die Historie eine liefert (kein
  // config.ts-Startwert wie bei FTP möglich, s. new-plan-dialog-view-model.ts).
  // State-Anpassung WÄHREND des Renders („Adjusting state when a prop
  // changes", React-Doku) statt in einem Effect — sonst kaskadierende
  // Zusatz-Renders (react-hooks/set-state-in-effect, ESLint-Fund). Nur beim
  // ERSTEN geladenen Wert, danach überschreibt das nicht mehr eine bewusste
  // Athlet-Eingabe (auch nicht ein absichtliches Leeren des Felds).
  const speedFromHistory =
    effectiveSport === "ride"
      ? null
      : ((aggregate as { currentThresholdSpeed?: number | null } | null)?.currentThresholdSpeed ??
        null);
  const [prefilledSpeed, setPrefilledSpeed] = useState<number | null>(null);
  if (speedFromHistory != null && speedFromHistory !== prefilledSpeed) {
    setPrefilledSpeed(speedFromHistory);
    if (form.currentThresholdSpeed == null) {
      const speed = speedFromHistory;
      setForm((f) =>
        f.currentThresholdSpeed == null ? { ...f, currentThresholdSpeed: speed } : f
      );
    }
  }

  const suggestion = suggestModel({
    level: form.level,
    weeks: effWeeks,
    weeklyHours: form.weeklyHours,
  });
  // Solange der Athlet das Modell nicht selbst gewählt hat, gilt der Vorschlag.
  const effectiveModel = modelTouched ? form.model : suggestion;

  // Live-Vorschau (V3, E3) — komplett getrennt vom Klick-`preview`-State
  // oben, reagiert bewusst NUR auf Level/Fokus/Modell (Entscheidung 5), nicht
  // auf Datum/Trainingstage/FTP/Zeitbudget (die sind während der Eingabe oft
  // ungültig, würden ständig Fehler/Flackern erzeugen). Scheitert
  // buildGeneratorInput() (z. B. Datum/Trainingstage gerade ungültig), zeigt
  // sich die Mini-Vorschau kommentarlos nicht — kein Ersatz für die
  // Fehlerliste beim Klick auf „Vorschau erstellen".
  const miniPreviewPlan = useMemo(() => {
    const effForm: NewPlanFormState = { ...form, model: effectiveModel };
    const built = buildGeneratorInput(effForm, resolveEventDate, effectiveSport, aggregate);
    if (!built.ok) return null;
    const run = generatePlan as (input: unknown) => GeneratedPlan;
    return run({ ...built.input, formats: formatEntries.map((e) => e.format) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.level, form.focus, effectiveModel]);

  function handlePreview() {
    const effForm: NewPlanFormState = { ...form, model: effectiveModel };
    const built = buildGeneratorInput(effForm, resolveEventDate, effectiveSport, aggregate);
    if (!built.ok) {
      setErrors(built.errors);
      setPreview(null);
      return;
    }
    setErrors({});
    setSaveError(null);
    const run = generatePlan as (input: unknown) => GeneratedPlan;
    const plan = run({ ...built.input, formats: formatEntries.map((e) => e.format) });
    // Plan + Input + Formularstand zusammen einfrieren — „Übernehmen" nimmt
    // exakt diese, nie einen inzwischen nachgeladenen Stand.
    setPreview({ plan, input: built.input, form: effForm });
  }

  async function handleAdopt() {
    if (!preview || saving) return; // Doppelklick-Schutz (disabled hinkt einen Render nach)
    setSaveError(null);
    if (!profile) {
      setSaveError("Profil lädt noch — kurz warten und erneut versuchen.");
      return;
    }
    const result = await createPlan({
      generated: preview.plan,
      input: preview.input,
      form: preview.form,
      createdBy: profile.id,
    });
    if (!result.ok) {
      setSaveError(result.error.message);
      return;
    }
    onClose();
  }

  function toggleWeekday(iso: number) {
    const nextWeekdays = form.trainingWeekdays.includes(iso)
      ? form.trainingWeekdays.filter((d) => d !== iso)
      : [...form.trainingWeekdays, iso].sort((a, b) => a - b);
    patch({
      trainingWeekdays: nextWeekdays,
      // ein Wochentag, der abgewählt wird, nimmt seinen festen Tag mit —
      // sonst bliebe ein verwaister Eintrag stehen, der erst bei „Vorschau
      // erstellen" als Fehler auffiele.
      fixedDays: form.fixedDays.filter((f) => nextWeekdays.includes(f.weekday)),
    });
  }

  function addFixedDay() {
    const freeWeekday = form.trainingWeekdays.find(
      (iso) => !form.fixedDays.some((f) => f.weekday === iso)
    );
    if (freeWeekday == null) return;
    patch({
      fixedDays: [
        ...form.fixedDays,
        { weekday: freeWeekday, typ: FIXED_DAY_TYPES[0], keepInRecoveryWeek: false },
      ],
    });
  }

  function updateFixedDay(index: number, next: Partial<FixedDay>) {
    patch({ fixedDays: form.fixedDays.map((f, i) => (i === index ? { ...f, ...next } : f)) });
  }

  function removeFixedDay(index: number) {
    patch({ fixedDays: form.fixedDays.filter((_, i) => i !== index) });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflowY: "auto",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        variant="strong"
        radius="22px"
        style={{ width: "100%", maxWidth: 620, padding: "26px 24px" }}
      >
        <div
          style={{
            fontFamily: "var(--font-disp)",
            fontWeight: 700,
            fontSize: "1rem",
            color: "var(--ink)",
          }}
        >
          Neuer Trainingsplan
        </div>
        <p style={{ margin: "8px 0 18px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Rahmenbedingungen festlegen, Vorschau prüfen, übernehmen. Der Plan lässt sich danach
          weiter per Einzelkarte nachbessern.
        </p>

        {willReplace && (
          <div
            style={{
              margin: "0 0 16px",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(224,138,60,.10)",
              border: "1px solid rgba(224,138,60,.35)",
              color: "var(--ink-2)",
              fontSize: ".78rem",
              lineHeight: 1.45,
            }}
          >
            Für diesen Athleten sind bereits künftige Trainingskarten hinterlegt. „Plan ersetzen"
            schreibt den neuen Plan und ersetzt <strong>alle künftigen Karten ab heute</strong> —
            vergangene und als ausgefallen markierte bleiben. Manuelle Änderungen an künftigen
            Karten gehen dabei verloren.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Geführt/Erweitert */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={guidedMode ? PRIMARY_BTN_STYLE : PILL_STYLE}
              onClick={() => setGuidedMode(true)}
            >
              Geführt
            </button>
            <button
              type="button"
              style={!guidedMode ? PRIMARY_BTN_STYLE : PILL_STYLE}
              onClick={() => setGuidedMode(false)}
            >
              Erweitert
            </button>
          </div>

          {/* Modus */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={form.mode === "open" ? PRIMARY_BTN_STYLE : PILL_STYLE}
              onClick={() => patch({ mode: "open" })}
            >
              Ohne festes Ende
            </button>
            <button
              type="button"
              style={form.mode === "event" ? PRIMARY_BTN_STYLE : PILL_STYLE}
              onClick={() => patch({ mode: "event" })}
            >
              Auf ein Event hin
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={LABEL_STYLE}>
              Startdatum (Montag)
              <input
                type="date"
                style={FIELD_STYLE}
                value={form.startDate}
                onChange={(e) => patch({ startDate: e.target.value })}
              />
            </label>

            {form.mode === "open" ? (
              <label style={LABEL_STYLE}>
                Planlänge (Wochen)
                <input
                  type="number"
                  min={3}
                  max={40}
                  style={FIELD_STYLE}
                  value={form.weeks}
                  onChange={(e) => patch({ weeks: Number(e.target.value) || 0 })}
                />
              </label>
            ) : (
              <label style={LABEL_STYLE}>
                Ziel-Event
                <select
                  style={FIELD_STYLE}
                  value={form.eventId || NEW_EVENT_VALUE}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === NEW_EVENT_VALUE) {
                      patch({ eventId: "" });
                    } else {
                      const ev = eventOptions.find((x) => x.id === v);
                      patch({ eventId: v, ftpTarget: form.ftpTarget ?? ev?.ftpGoal ?? null });
                    }
                  }}
                >
                  {eventOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {fmtDate(e.eventDate)} — {e.title}
                      {e.priority ? ` (${e.priority})` : ""}
                    </option>
                  ))}
                  <option value={NEW_EVENT_VALUE}>Anderes Event anlegen …</option>
                </select>
              </label>
            )}
          </div>

          {form.mode === "event" && !form.eventId && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={LABEL_STYLE}>
                Renntag
                <input
                  type="date"
                  style={FIELD_STYLE}
                  value={form.newEventDate}
                  onChange={(e) => patch({ newEventDate: e.target.value })}
                />
              </label>
              <label style={LABEL_STYLE}>
                Event-Name
                <input
                  type="text"
                  style={FIELD_STYLE}
                  value={form.newEventName}
                  onChange={(e) => patch({ newEventName: e.target.value })}
                  placeholder="z. B. GFNY Hamburg"
                />
              </label>
            </div>
          )}

          {/* Trainingstage */}
          <div style={LABEL_STYLE}>
            Trainingstage
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {WEEKDAY_LABELS.map((d) => {
                const on = form.trainingWeekdays.includes(d.iso);
                return (
                  <button
                    key={d.iso}
                    type="button"
                    style={
                      on ? { ...PILL_STYLE, ...PRIMARY_BTN_STYLE, padding: "6px 12px" } : PILL_STYLE
                    }
                    onClick={() => toggleWeekday(d.iso)}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feste Tage — nur Rad, FIXED_DAY_TYPES kennt nur das Rad-Vokabular. */}
          {effectiveSport === "ride" && (
            <div style={LABEL_STYLE}>
              Feste Tage (optional)
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {form.fixedDays.map((fd, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
                  >
                    <select
                      style={{ ...FIELD_STYLE, width: "auto" }}
                      value={fd.weekday}
                      onChange={(e) => updateFixedDay(i, { weekday: Number(e.target.value) })}
                    >
                      {form.trainingWeekdays
                        .filter(
                          (iso) =>
                            iso === fd.weekday || !form.fixedDays.some((f) => f.weekday === iso)
                        )
                        .map((iso) => (
                          <option key={iso} value={iso}>
                            {WEEKDAY_LABELS.find((w) => w.iso === iso)?.short}
                          </option>
                        ))}
                    </select>
                    <select
                      style={{ ...FIELD_STYLE, width: "auto", flex: 1, minWidth: 120 }}
                      value={fd.typ}
                      onChange={(e) => updateFixedDay(i, { typ: e.target.value })}
                    >
                      {FIXED_DAY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t === FIXED_INTERVAL_TYP ? "Intervalle (passend zur Phase)" : t}
                        </option>
                      ))}
                    </select>
                    {/* Intervalltage entfallen in Erholungswochen immer (keine
                        Qualitätstage dort) — die Checkbox hätte keine Wirkung. */}
                    {fd.typ !== FIXED_INTERVAL_TYP && (
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: ".76rem",
                          color: "var(--ink-3)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={fd.keepInRecoveryWeek}
                          onChange={(e) =>
                            updateFixedDay(i, { keepInRecoveryWeek: e.target.checked })
                          }
                        />
                        auch in Erholungswochen
                      </label>
                    )}
                    <button
                      type="button"
                      style={PILL_STYLE}
                      onClick={() => removeFixedDay(i)}
                      aria-label="Festen Tag entfernen"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  style={PILL_STYLE}
                  onClick={addFixedDay}
                  disabled={form.fixedDays.length >= form.trainingWeekdays.length}
                >
                  + Fester Tag
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={LABEL_STYLE}>
              Zeitbudget (h/Woche)
              <input
                type="number"
                min={1}
                max={25}
                step={0.5}
                style={FIELD_STYLE}
                value={form.weeklyHours}
                onChange={(e) => patch({ weeklyHours: Number(e.target.value) || 0 })}
              />
            </label>
            <label style={LABEL_STYLE}>
              Indoor-Anteil ({form.indoorPct} %)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.indoorPct}
                onChange={(e) => patch({ indoorPct: Number(e.target.value) })}
              />
            </label>
          </div>

          {effectiveSport === "ride" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={LABEL_STYLE}>
                Aktuelle FTP (W)
                <input
                  type="number"
                  min={80}
                  max={500}
                  style={FIELD_STYLE}
                  value={form.currentFtp ?? ""}
                  onChange={(e) => {
                    setFtpTouched(true);
                    patch({ currentFtp: e.target.value ? Number(e.target.value) : null });
                  }}
                />
                {isSelf && (
                  <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>
                    Wirkt nur für diesen Plan · dauerhaft hinterlegen: Settings → FTP-Historie
                  </span>
                )}
              </label>
              <label style={LABEL_STYLE}>
                FTP-Ziel (W, optional)
                <input
                  type="number"
                  min={80}
                  max={500}
                  style={FIELD_STYLE}
                  value={form.ftpTarget ?? ""}
                  placeholder={forecastHint != null ? `Prognose ${forecastHint}` : "wird berechnet"}
                  onChange={(e) =>
                    patch({ ftpTarget: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={LABEL_STYLE}>
                Aktuelle Schwellenpace (km/h)
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={0.1}
                  style={FIELD_STYLE}
                  value={form.currentThresholdSpeed ?? ""}
                  onChange={(e) =>
                    patch({ currentThresholdSpeed: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
              <label style={LABEL_STYLE}>
                Schwellenpace-Ziel (km/h, optional)
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={0.1}
                  style={FIELD_STYLE}
                  value={form.thresholdSpeedTarget ?? ""}
                  onChange={(e) =>
                    patch({ thresholdSpeedTarget: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
            </div>
          )}

          {guidedMode ? (
            <GuidedPlanQuestions
              onComplete={({ level, focus }) => {
                patch({ level, focus });
                setGuidedMode(false);
              }}
            />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={LABEL_STYLE}>
                  Erfahrungslevel
                  <select
                    style={FIELD_STYLE}
                    value={form.level}
                    onChange={(e) => patch({ level: e.target.value as PlanLevel })}
                  >
                    <option value="einsteiger">Einsteiger</option>
                    <option value="fortgeschritten">Fortgeschritten</option>
                  </select>
                  <span style={{ fontSize: ".72rem" }}>
                    {parseDescriptionSegments(LEVEL_DESCRIPTIONS[form.level]).map((seg, i) => (
                      <span
                        key={i}
                        style={{ color: seg.sign === "plus" ? "var(--z1)" : "var(--danger)" }}
                      >
                        {i > 0 && " · "}
                        {seg.text}
                      </span>
                    ))}
                  </span>
                </label>
                <label style={LABEL_STYLE}>
                  Fokus
                  <select
                    style={FIELD_STYLE}
                    value={form.focus}
                    onChange={(e) => patch({ focus: e.target.value as PlanFocus })}
                  >
                    {(Object.keys(FOCUS_LABELS) as PlanFocus[]).map((f) => (
                      <option key={f} value={f}>
                        {FOCUS_LABELS[f]}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: ".72rem" }}>
                    {parseDescriptionSegments(FOCUS_DESCRIPTIONS[form.focus]).map((seg, i) => (
                      <span
                        key={i}
                        style={{ color: seg.sign === "plus" ? "var(--z1)" : "var(--danger)" }}
                      >
                        {i > 0 && " · "}
                        {seg.text}
                      </span>
                    ))}
                  </span>
                </label>
              </div>

              <label style={LABEL_STYLE}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Periodisierungsmodell{" "}
                  {!modelTouched && (
                    <span style={{ color: "var(--ink-3)" }}>
                      · Vorschlag: {MODEL_LABELS[suggestion]}
                    </span>
                  )}
                  <button
                    type="button"
                    style={{ ...PILL_STYLE, marginLeft: "auto" }}
                    onClick={() => setComparing(true)}
                  >
                    Vergleichen
                  </button>
                </span>
                <select
                  style={FIELD_STYLE}
                  value={effectiveModel}
                  onChange={(e) => {
                    setModelTouched(true);
                    patch({ model: e.target.value as PlanModel });
                  }}
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {MODEL_LABELS[m]}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: ".72rem" }}>
                  {parseDescriptionSegments(MODEL_DESCRIPTIONS[effectiveModel]).map((seg, i) => (
                    <span
                      key={i}
                      style={{ color: seg.sign === "plus" ? "var(--z1)" : "var(--danger)" }}
                    >
                      {i > 0 && " · "}
                      {seg.text}
                    </span>
                  ))}
                </span>
                <div style={{ marginTop: 6 }}>
                  <ModelBlockBar shares={MODEL_BLOCK_SHARES[effectiveModel]} />
                </div>
              </label>

              {miniPreviewPlan && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: ".72rem", color: "var(--ink-3)", marginBottom: 4 }}>
                    Wochenverlauf bei dieser Auswahl
                  </div>
                  <MiniPlanPreview plan={miniPreviewPlan} />
                </div>
              )}
            </>
          )}

          {(Object.keys(errors).length > 0 || saveError) && (
            <ul
              style={{
                margin: 0,
                padding: "8px 12px 8px 26px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(217,79,79,.10)",
                border: "1px solid rgba(217,79,79,.35)",
                color: "var(--danger)",
                fontSize: ".78rem",
              }}
            >
              {Object.values(errors).map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
              {saveError && <li>{saveError}</li>}
            </ul>
          )}

          {preview && (
            <div style={{ borderTop: "1px solid var(--hair)", paddingTop: 14 }}>
              <PlanPreview
                plan={preview.plan}
                sport={preview.input.sport ?? "ride"}
                thresholdSpeedTarget={preview.input.thresholdSpeedTarget ?? null}
              />
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" style={BTN_STYLE} onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button type="button" style={BTN_STYLE} onClick={handlePreview} disabled={saving}>
            Vorschau erstellen
          </button>
          <button
            type="button"
            style={
              preview && !saving
                ? PRIMARY_BTN_STYLE
                : { ...PRIMARY_BTN_STYLE, opacity: 0.5, cursor: "not-allowed" }
            }
            disabled={!preview || saving}
            onClick={handleAdopt}
            title={preview ? undefined : "Erst eine Vorschau erstellen"}
          >
            {saving ? "Speichert…" : willReplace ? "Plan ersetzen" : "Übernehmen"}
          </button>
        </div>
      </GlassCard>

      {comparing && (
        <CompareModelsDialog
          initialLeft={effectiveModel}
          onAdopt={(model) => {
            setModelTouched(true);
            patch({ model });
            setComparing(false);
          }}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}
