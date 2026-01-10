/**
 * Get system color scheme preference
 */
export function getSystemPreference(): "light" | "dark" {
	if (typeof window === "undefined") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

/**
 * Subscribe to system color scheme changes
 */
export function onSystemPreferenceChange(
	callback: (preference: "light" | "dark") => void,
): () => void {
	if (typeof window === "undefined") return () => {};

	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const handler = (event: MediaQueryListEvent) => {
		callback(event.matches ? "dark" : "light");
	};

	mediaQuery.addEventListener("change", handler);
	return () => mediaQuery.removeEventListener("change", handler);
}
