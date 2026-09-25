import type { CSSProperties } from "react";

export const LABEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: ".76rem",
  color: "var(--ink-3)",
};

export const BTN_STYLE: CSSProperties = {
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  padding: "8px 16px",
  background: "transparent",
  color: "var(--ink-2)",
  font: "inherit",
  fontSize: ".82rem",
  cursor: "pointer",
};

export const PRIMARY_BTN_STYLE: CSSProperties = {
  ...BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

export const PILL_STYLE: CSSProperties = {
  ...BTN_STYLE,
  padding: "6px 12px",
  fontSize: ".78rem",
};
