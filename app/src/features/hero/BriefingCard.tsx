import { GlassCard } from "../../components/GlassCard";
import type { HeroBriefing } from "./hero-view-model";
import { LEVEL_COLOR } from "./briefing-level";

/** Status-Label (Punkt+Text-Stil, konsistent mit ReadinessCard.tsx) statt der
 *  bisherigen 3-Boxen-Ampel. Beide Karten beantworten "wie geht's mir heute"
 *  und sollen als ein System wirken, nicht als zwei konkurrierende Meinungen. */
const LEVEL_LABEL: Record<HeroBriefing["level"], string> = {
  green: "Grünes Licht",
  yellow: "Mit Bedacht",
  red: "Erholung priorisieren",
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 24px", borderLeft: "1px solid var(--hair)" }}>
      <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--ink)" }}>{value}</span>
    </div>
  );
}

/** Belastungsempfehlung-Kachel. Ampel + Verb + Begründung aus
 *  `core/briefing.js::buildBriefing()`, zusammengesetzt in
 *  hero-view-model.ts::buildBriefingInfo(). Maße/Radien synchronisiert mit
 *  Hero-Weitwinkel.dc.html (löst Hero-Ebenen.dc.html als Quelle ab). */
export function BriefingCard({ briefing }: { briefing: HeroBriefing }) {
  const color = LEVEL_COLOR[briefing.level];
  return (
    <GlassCard variant="strong" radius="28px" style={{ padding: "28px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
        Belastungsempfehlung
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 14px ${color}`, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".95rem", color }}>{LEVEL_LABEL[briefing.level]}</div>
          <div style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>{briefing.recommendation}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingTop: 12, borderTop: "1px solid var(--hair)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingRight: 24 }}>
          <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>Form</span>
          <span style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--ink)" }}>{briefing.tsbFmt}</span>
        </div>
        <StatChip label="Ruhepuls" value={briefing.rhr} />
        <StatChip label="HRV" value={briefing.hrv} />
      </div>
    </GlassCard>
  );
}
