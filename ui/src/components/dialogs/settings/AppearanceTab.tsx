import { Check, LayoutList, Monitor } from "lucide-react";
import { useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { SettingCheckbox } from "@/components/ui/setting-checkbox";
import { cn } from "@/lib/utils";
import type { ThemeDefinition } from "@/themes";

interface AppearanceTabProps {
	themeId: string;
	onThemeChange: (themeId: string) => void;
	isSystemMode: boolean;
	onSystemModeChange: (enabled: boolean) => void;
	availableThemes: ThemeDefinition[];
	compactView: boolean;
	onCompactViewChange: (enabled: boolean) => void;
	expandNewMessages: boolean;
	onExpandNewMessagesChange: (enabled: boolean) => void;
}

function ThemePreview({ theme }: { theme: ThemeDefinition }) {
	return (
		<div className="rounded-lg overflow-hidden border border-border">
			<div
				className="h-28 flex"
				style={{ backgroundColor: theme.colors.background }}
			>
				{/* Sidebar */}
				<div
					className="w-[22%] h-full flex flex-col gap-1.5 p-1.5"
					style={{
						backgroundColor: theme.colors.sidebar,
						borderRight: `1px solid ${theme.colors.sidebarBorder}`,
					}}
				>
					<div
						className="w-full h-1.5 rounded-sm"
						style={{ backgroundColor: theme.colors.sidebarPrimary }}
					/>
					<div
						className="w-3/4 h-1 rounded-sm"
						style={{ backgroundColor: theme.colors.sidebarAccent }}
					/>
					<div
						className="w-3/4 h-1 rounded-sm"
						style={{ backgroundColor: theme.colors.sidebarAccent }}
					/>
				</div>

				{/* Main content area */}
				<div className="flex-1 p-2 flex flex-col gap-1.5">
					{/* Card */}
					<div
						className="flex-1 rounded-md p-1.5 flex items-center gap-1.5"
						style={{
							backgroundColor: theme.colors.card,
							border: `1px solid ${theme.colors.border}`,
						}}
					>
						<div
							className="w-2.5 h-2.5 rounded-full shrink-0"
							style={{ backgroundColor: theme.colors.primary }}
						/>
						<div
							className="h-1.5 w-full rounded-sm"
							style={{ backgroundColor: theme.colors.muted }}
						/>
					</div>
					{/* Secondary line */}
					<div className="flex gap-1">
						<div
							className="h-1 w-6 rounded-sm"
							style={{ backgroundColor: theme.colors.mutedForeground }}
						/>
						<div
							className="h-1 w-4 rounded-sm"
							style={{ backgroundColor: theme.colors.mutedForeground }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function ThemeListItem({
	theme,
	isSelected,
	disabled,
	onSelect,
	onHover,
}: {
	theme: ThemeDefinition;
	isSelected: boolean;
	disabled?: boolean;
	onSelect: (id: string) => void;
	onHover: (theme: ThemeDefinition | null) => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"flex items-center gap-2 py-1.5 px-2 rounded text-left transition-colors w-full",
				"hover:bg-accent",
				disabled && "opacity-50 pointer-events-none",
			)}
			onClick={() => onSelect(theme.id)}
			onMouseEnter={() => onHover(theme)}
			onMouseLeave={() => onHover(null)}
			disabled={disabled}
		>
			<div
				className="w-3 h-3 rounded-full border border-black/10 shrink-0"
				style={{ backgroundColor: theme.colors.primary }}
			/>
			<span className="text-xs flex-1 truncate">{theme.name}</span>
			{isSelected && (
				<Check className="w-3 h-3 shrink-0 text-muted-foreground" />
			)}
		</button>
	);
}

function ThemeList({
	label,
	themes,
	selectedId,
	onSelect,
	onHover,
	disabled,
}: {
	label: string;
	themes: ThemeDefinition[];
	selectedId: string;
	onSelect: (id: string) => void;
	onHover: (theme: ThemeDefinition | null) => void;
	disabled?: boolean;
}) {
	return (
		<div className="space-y-1">
			<h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				{label}
			</h4>
			<div className="grid grid-cols-2 gap-x-1">
				{themes.map((theme) => (
					<ThemeListItem
						key={theme.id}
						theme={theme}
						isSelected={!disabled && selectedId === theme.id}
						disabled={disabled}
						onSelect={onSelect}
						onHover={onHover}
					/>
				))}
			</div>
		</div>
	);
}

export function AppearanceTab({
	themeId,
	onThemeChange,
	isSystemMode,
	onSystemModeChange,
	availableThemes,
	compactView,
	onCompactViewChange,
	expandNewMessages,
	onExpandNewMessagesChange,
}: AppearanceTabProps) {
	const [previewTheme, setPreviewTheme] = useState<ThemeDefinition | null>(
		null,
	);

	const lightThemes = useMemo(
		() => availableThemes.filter((t) => !t.isDark),
		[availableThemes],
	);
	const darkThemes = useMemo(
		() => availableThemes.filter((t) => t.isDark),
		[availableThemes],
	);

	const displayedTheme =
		previewTheme ??
		availableThemes.find((t) => t.id === themeId) ??
		availableThemes[0];

	return (
		<div className="space-y-4">
			<div className="space-y-3">
				<ThemePreview theme={displayedTheme} />

				<ThemeList
					label="Light"
					themes={lightThemes}
					selectedId={themeId}
					onSelect={onThemeChange}
					onHover={setPreviewTheme}
					disabled={isSystemMode}
				/>
				<ThemeList
					label="Dark"
					themes={darkThemes}
					selectedId={themeId}
					onSelect={onThemeChange}
					onHover={setPreviewTheme}
					disabled={isSystemMode}
				/>
			</div>

			<SettingCheckbox
				id="system-mode"
				checked={isSystemMode}
				onCheckedChange={onSystemModeChange}
				label="Use system preference"
				icon={<Monitor className="h-4 w-4 text-muted-foreground" />}
				description={
					isSystemMode
						? "Automatically switches between Light and Dark based on your system settings"
						: undefined
				}
				className="pt-2"
			/>

			<Separator />

			<div className="space-y-3">
				<h4 className="text-sm font-medium flex items-center gap-2">
					<LayoutList className="h-4 w-4 text-muted-foreground" />
					Message Display
				</h4>

				<SettingCheckbox
					id="compact-view"
					checked={compactView}
					onCheckedChange={onCompactViewChange}
					label="Compact view"
					description="Show messages in collapsed accordion style. Click to expand."
				/>

				{compactView && (
					<SettingCheckbox
						id="expand-new-messages"
						checked={expandNewMessages}
						onCheckedChange={onExpandNewMessagesChange}
						label="Expand new messages"
						description="Automatically expand newly received messages"
						className="pt-2"
					/>
				)}
			</div>
		</div>
	);
}
