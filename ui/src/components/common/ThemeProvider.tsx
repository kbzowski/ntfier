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

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [themeId, setThemeIdState] = useState<string>(
		() => getInitialState().themeId,
	);
	const [isSystemMode, setSystemModeState] = useState<boolean>(
		() => getInitialState().isSystemMode,
	);

	// Determine the effective theme based on system mode
	const getEffectiveTheme = (): ThemeDefinition => {
		if (isSystemMode) {
			const systemPref = getSystemPreference();
			return getThemeById(systemPref) ?? themes[1]; // fallback to dark
		}
		return getThemeById(themeId) ?? themes[1]; // fallback to dark
	};

	const [currentTheme, setCurrentTheme] =
		useState<ThemeDefinition>(getEffectiveTheme);

	// Apply theme when it changes
	useEffect(() => {
		const theme = getEffectiveTheme();
		setCurrentTheme(theme);
		applyTheme(theme);
	}, [themeId, isSystemMode]);

	// Listen for system preference changes when in system mode
	useEffect(() => {
		if (!isSystemMode) return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			const theme = getEffectiveTheme();
			setCurrentTheme(theme);
			applyTheme(theme);
		};

		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	}, [isSystemMode]);

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
