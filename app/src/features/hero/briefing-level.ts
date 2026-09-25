import type { HeroBriefing } from "./hero-view-model";

export const LEVEL_COLOR: Record<HeroBriefing["level"], string> = {
  green: "var(--ok)",
  yellow: "var(--warn)",
  red: "var(--danger)",
};
