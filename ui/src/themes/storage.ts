/**
 * Storage keys for theme persistence
 */
export const THEME_STORAGE_KEY = "ntfier-theme-id";
export const SYSTEM_MODE_KEY = "ntfier-system-mode";

/** Module-level cache to avoid repeated synchronous localStorage reads */
let cachedPreferences: { themeId: string; isSystemMode: boolean } | null = null;

// Invalidate cache when another tab/window changes localStorage
if (typeof window !== "undefined") {
	window.addEventListener("storage", (e) => {
		if (e.key === THEME_STORAGE_KEY || e.key === SYSTEM_MODE_KEY) {
			cachedPreferences = null;
		}
	});
}

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

	if (cachedPreferences) {
		return cachedPreferences;
	}

	try {
		const savedThemeId = localStorage.getItem(THEME_STORAGE_KEY);
		const savedSystemMode = localStorage.getItem(SYSTEM_MODE_KEY);

		cachedPreferences = {
			themeId: savedThemeId ?? "dark",
			isSystemMode:
				savedSystemMode === null ? true : savedSystemMode === "true",
		};
		return cachedPreferences;
	} catch {
		return { themeId: "dark", isSystemMode: true };
	}
}

/**
 * Save theme preferences to localStorage
 */
export function saveThemePreferences(
	themeId: string,
	isSystemMode: boolean,
): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.setItem(THEME_STORAGE_KEY, themeId);
		localStorage.setItem(SYSTEM_MODE_KEY, String(isSystemMode));
		cachedPreferences = { themeId, isSystemMode };
	} catch {
		// Silently fail — storage may be unavailable (incognito, quota exceeded)
	}
}
