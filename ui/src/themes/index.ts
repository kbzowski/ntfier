export interface ThemeColors {
	background: string;
	foreground: string;
	card: string;
	cardForeground: string;
	popover: string;
	popoverForeground: string;
	primary: string;
	primaryForeground: string;
	secondary: string;
	secondaryForeground: string;
	muted: string;
	mutedForeground: string;
	accent: string;
	accentForeground: string;
	destructive: string;
	destructiveForeground: string;
	border: string;
	input: string;
	ring: string;
	// Chart colors
	chart1: string;
	chart2: string;
	chart3: string;
	chart4: string;
	chart5: string;
	// Sidebar
	sidebar: string;
	sidebarForeground: string;
	sidebarPrimary: string;
	sidebarPrimaryForeground: string;
	sidebarAccent: string;
	sidebarAccentForeground: string;
	sidebarBorder: string;
	sidebarRing: string;
}

export interface ThemeDefinition {
	id: string;
	name: string;
	isDark: boolean;
	colors: ThemeColors;
}

// All themes array
export { getDarkThemes, getLightThemes, getThemeById, themes } from "./presets";
export { blueTheme } from "./presets/blue";
export { darkTheme } from "./presets/dark";
export { greenTheme } from "./presets/green";
export { lavenderTheme } from "./presets/lavender";
// Re-export presets
export { lightTheme } from "./presets/light";
export { mintTheme } from "./presets/mint";
export { purpleTheme } from "./presets/purple";
export { roseTheme } from "./presets/rose";
export { sandTheme } from "./presets/sand";
export { skyTheme } from "./presets/sky";
