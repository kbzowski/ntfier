import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import type { ThemeDefinition } from "@/themes";
import { getThemeById, themes } from "@/themes";
import {
	applyTheme,
	getSystemPreference,
	loadThemePreferences,
	saveThemePreferences,
} from "@/themes/utils";

interface ThemeContextValue {
	themeId: string;
	setThemeId: (id: string) => void;
	currentTheme: ThemeDefinition;
	availableThemes: ThemeDefinition[];
	isSystemMode: boolean;
	setSystemMode: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialState() {
	if (typeof window === "undefined") {
		return { themeId: "dark", isSystemMode: true };
	}
	return loadThemePreferences();
}

// Determine the effective theme based on system mode
function resolveTheme(
	systemMode: boolean,
	selectedThemeId: string,
): ThemeDefinition {
	if (systemMode) {
		const systemPref = getSystemPreference();
		return getThemeById(systemPref) ?? themes[1]; // fallback to dark
	}
	return getThemeById(selectedThemeId) ?? themes[1]; // fallback to dark
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [themeId, setThemeIdState] = useState<string>(
		() => getInitialState().themeId,
	);
	const [isSystemMode, setSystemModeState] = useState<boolean>(
		() => getInitialState().isSystemMode,
	);

	const [currentTheme, setCurrentTheme] = useState<ThemeDefinition>(() =>
		resolveTheme(isSystemMode, themeId),
	);

	// Apply theme when it changes
	useEffect(() => {
		const theme = resolveTheme(isSystemMode, themeId);
		setCurrentTheme(theme);
		applyTheme(theme);
	}, [themeId, isSystemMode]);

	// Listen for system preference changes when in system mode
	useEffect(() => {
		if (!isSystemMode) return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			const theme = resolveTheme(true, themeId);
			setCurrentTheme(theme);
			applyTheme(theme);
		};

		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	}, [isSystemMode, themeId]);

	// Persist preferences
	useEffect(() => {
		saveThemePreferences(themeId, isSystemMode);
	}, [themeId, isSystemMode]);

	const setThemeId = (id: string) => {
		setThemeIdState(id);
	};

	const setSystemMode = (enabled: boolean) => {
		setSystemModeState(enabled);
	};

	return (
		<ThemeContext.Provider
			value={{
				themeId,
				setThemeId,
				currentTheme,
				availableThemes: themes,
				isSystemMode,
				setSystemMode,
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
