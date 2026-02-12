import type { ThemeDefinition } from "../index";
import { blueTheme } from "./blue";
import { darkTheme } from "./dark";
import { greenTheme } from "./green";
import { lavenderTheme } from "./lavender";
import { lightTheme } from "./light";
import { mintTheme } from "./mint";
import { purpleTheme } from "./purple";
import { roseTheme } from "./rose";
import { sandTheme } from "./sand";
import { skyTheme } from "./sky";

export { blueTheme } from "./blue";
export { darkTheme } from "./dark";
export { greenTheme } from "./green";
export { lavenderTheme } from "./lavender";
export { lightTheme } from "./light";
export { mintTheme } from "./mint";
export { purpleTheme } from "./purple";
export { roseTheme } from "./rose";
export { sandTheme } from "./sand";
export { skyTheme } from "./sky";

/**
 * All available themes
 * Add new themes here to make them available in the UI
 */
export const themes: ThemeDefinition[] = [
	// Light themes
	lightTheme,
	roseTheme,
	skyTheme,
	mintTheme,
	lavenderTheme,
	sandTheme,
	// Dark themes
	darkTheme,
	blueTheme,
	greenTheme,
	purpleTheme,
];

/**
 * Index map for O(1) theme lookup by ID
 */
const themeMap = new Map<string, ThemeDefinition>(
	themes.map((theme) => [theme.id, theme]),
);

/**
 * Get a theme by its ID
 */
export function getThemeById(id: string): ThemeDefinition | undefined {
	return themeMap.get(id);
}

/**
 * Get all light themes (for system preference matching)
 */
export function getLightThemes(): ThemeDefinition[] {
	return themes.filter((theme) => !theme.isDark);
}

/**
 * Get all dark themes (for system preference matching)
 */
export function getDarkThemes(): ThemeDefinition[] {
	return themes.filter((theme) => theme.isDark);
}
