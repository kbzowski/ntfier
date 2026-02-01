import { Check, LayoutList, Monitor } from "lucide-react";
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

function ThemePreview({
	theme,
	isSelected,
}: {
	theme: ThemeDefinition;
	isSelected: boolean;
}) {
	return (
		<div
			className="relative rounded-lg overflow-hidden border-2 transition-all"
			style={{
				borderColor: isSelected ? theme.colors.primary : "transparent",
			}}
		>
			<div
				className="p-3 h-16"
				style={{ backgroundColor: theme.colors.background }}
			>
				<div className="flex items-center gap-2">
					<div
						className="w-3 h-3 rounded-full"
						style={{ backgroundColor: theme.colors.primary }}
					/>
					<div
						className="h-2 w-12 rounded"
						style={{ backgroundColor: theme.colors.muted }}
					/>
				</div>
				<div className="mt-2 flex gap-1">
					<div
						className="h-1.5 w-8 rounded"
						style={{ backgroundColor: theme.colors.mutedForeground }}
					/>
					<div
						className="h-1.5 w-6 rounded"
						style={{ backgroundColor: theme.colors.mutedForeground }}
					/>
				</div>
			</div>
			{isSelected && (
				<div
					className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
					style={{ backgroundColor: theme.colors.primary }}
				>
					<Check
						className="w-3 h-3"
						style={{ color: theme.colors.primaryForeground }}
					/>
				</div>
			)}
		</div>
	);
}

function ThemeSelector({
	themes,
	selectedId,
	onSelect,
	disabled,
}: {
	themes: ThemeDefinition[];
	selectedId: string;
	onSelect: (id: string) => void;
	disabled?: boolean;
}) {
	return (
		<div className="grid grid-cols-3 gap-3">
			{themes.map((theme) => (
				<button
					key={theme.id}
					type="button"
					className={cn(
						"text-left transition-all rounded-lg select-none",
						"hover:ring-2 hover:ring-ring hover:ring-offset-2",
						"focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
						disabled && "opacity-50 pointer-events-none",
					)}
					onClick={() => onSelect(theme.id)}
					disabled={disabled}
				>
					<ThemePreview
						theme={theme}
						isSelected={!disabled && selectedId === theme.id}
					/>
					<p className="mt-1.5 text-xs font-medium text-center truncate">
						{theme.name}
					</p>
				</button>
			))}
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
	return (
		<div className="space-y-4">
			<ThemeSelector
				themes={availableThemes}
				selectedId={themeId}
				onSelect={onThemeChange}
				disabled={isSystemMode}
			/>

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
