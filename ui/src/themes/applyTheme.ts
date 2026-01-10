import type { ThemeColors, ThemeDefinition } from "./index";

/**
 * Maps ThemeColors keys to CSS variable names
 */
const colorToCssVar: Record<keyof ThemeColors, string> = {
	background: "--background",
	foreground: "--foreground",
	card: "--card",
	cardForeground: "--card-foreground",
	popover: "--popover",
	popoverForeground: "--popover-foreground",
	primary: "--primary",
	primaryForeground: "--primary-foreground",
	secondary: "--secondary",
	secondaryForeground: "--secondary-foreground",
	muted: "--muted",
	mutedForeground: "--muted-foreground",
	accent: "--accent",
	accentForeground: "--accent-foreground",
	destructive: "--destructive",
	destructiveForeground: "--destructive-foreground",
	border: "--border",
	input: "--input",
	ring: "--ring",
	chart1: "--chart-1",
	chart2: "--chart-2",
	chart3: "--chart-3",
	chart4: "--chart-4",
	chart5: "--chart-5",
	sidebar: "--sidebar",
	sidebarForeground: "--sidebar-foreground",
	sidebarPrimary: "--sidebar-primary",
	sidebarPrimaryForeground: "--sidebar-primary-foreground",
	sidebarAccent: "--sidebar-accent",
	sidebarAccentForeground: "--sidebar-accent-foreground",
	sidebarBorder: "--sidebar-border",
	sidebarRing: "--sidebar-ring",
};

/**
 * Apply a theme to the document by setting CSS variables
 */
export function applyTheme(theme: ThemeDefinition): void {
	const root = document.documentElement;

	for (const [key, cssVar] of Object.entries(colorToCssVar)) {
		const value = theme.colors[key as keyof ThemeColors];
		if (value) {
			root.style.setProperty(cssVar, value);
		}
	}

	if (theme.isDark) {
		root.classList.add("dark");
	} else {
		root.classList.remove("dark");
	}
}
