import type { ComponentType } from "react";
import type { StoreWithProducts, ThemeId } from "@/lib/types";
import { BoldTheme } from "./bold";
import { MinimalTheme } from "./minimal";

/** Registre des thèmes. Ajouter un thème = ajouter une ligne ici (+ dans THEME_IDS). */
export const THEMES: Record<ThemeId, ComponentType<StoreWithProducts>> = {
  minimal: MinimalTheme,
  bold: BoldTheme,
};
