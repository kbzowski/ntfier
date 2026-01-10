/**
 * Storage keys for theme persistence
 */
export const THEME_STORAGE_KEY = "ntfier-theme-id";
export const SYSTEM_MODE_KEY = "ntfier-system-mode";

/**
 * Load saved theme preferences from localStorage
 */
export function loadThemePreferences(): {
	themeId: string;
	isSystemMode: boolean;
} {
	if (typeof window === "undefined") {
		return { themeId: "dark", isSystemMode: true };
	}

	const savedThemeId = localStorage.getItem(THEME_STORAGE_KEY);
	const savedSystemMode = localStorage.getItem(SYSTEM_MODE_KEY);

	return {
		themeId: savedThemeId ?? "dark",
		isSystemMode: savedSystemMode === null ? true : savedSystemMode === "true",
	};
}

/**
 * Save theme preferences to localStorage
 */
export function saveThemePreferences(
	themeId: string,
	isSystemMode: boolean,
): void {
	if (typeof window === "undefined") return;

	localStorage.setItem(THEME_STORAGE_KEY, themeId);
	localStorage.setItem(SYSTEM_MODE_KEY, String(isSystemMode));
}
