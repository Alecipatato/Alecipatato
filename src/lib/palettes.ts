import type { StoreConfig } from "./types";

/** Palettes proposées dans le formulaire de création. L'IA peut aussi choisir seule. */
export const PALETTES: Record<string, { label: string; colors: StoreConfig["colors"] }> = {
  foret: { label: "Forêt", colors: { primary: "#2f5d50", accent: "#a8743a", background: "#f8f6f1", text: "#1d2a25" } },
  ocean: { label: "Océan", colors: { primary: "#1d4e89", accent: "#0f8b8d", background: "#f5f8fb", text: "#14213d" } },
  terre: { label: "Terre cuite", colors: { primary: "#9a4a2b", accent: "#c08a2e", background: "#fbf6f0", text: "#2d1f17" } },
  nuit: { label: "Nuit néon", colors: { primary: "#7c3aed", accent: "#22d3ee", background: "#0f0f14", text: "#f4f4f6" } },
  rose: { label: "Rose poudré", colors: { primary: "#b5446e", accent: "#8a6f4d", background: "#fdf7f8", text: "#2b1d22" } },
  mono: { label: "Noir et blanc", colors: { primary: "#111111", accent: "#6b6b6b", background: "#ffffff", text: "#111111" } },
};
