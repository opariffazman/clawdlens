// Re-export of the generated art (see scripts/gen-icon-art.ts / bun run gen:art).
export { ICON_ART_7, ICON_ART_13, LABEL_ART, LABEL_H, type ArtKey } from "./iconArt.gen";
export const ART_W7 = 7;
export const ART_H7 = 3;
export const ART_W13 = 13;
export const ART_H13 = 5;

// TEMP compat for Lens.tsx until the Task-4 rewire — remove in Task 4.
import { ICON_ART_7 as _i7 } from "./iconArt.gen";
export const ICON_ART = _i7;
export const ART_W = 7;
export const ART_H = 3;
