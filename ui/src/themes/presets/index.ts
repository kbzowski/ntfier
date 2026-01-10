import type { ThemeDefinition } from "../index";
import { blueTheme } from "./blue";
import { darkTheme } from "./dark";
import { greenTheme } from "./green";
import { lightTheme } from "./light";
import { purpleTheme } from "./purple";
import { roseTheme } from "./rose";

export { blueTheme } from "./blue";
export { darkTheme } from "./dark";
export { greenTheme } from "./green";
export { lightTheme } from "./light";
export { purpleTheme } from "./purple";
export { roseTheme } from "./rose";

/**
 * All available themes
 * Add new themes here to make them available in the UI
 */
export const themes: ThemeDefinition[] = [
	lightTheme,
	darkTheme,
	blueTheme,
	greenTheme,
	purpleTheme,
	roseTheme,
];

/**
 * Get a theme by its ID
 */
export function getThemeById(id: string): ThemeDefinition | undefined {
	return themes.find((theme) => theme.id === id);
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
