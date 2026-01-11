import { Check, Monitor } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ThemeDefinition } from "@/themes";

interface AppearanceTabProps {
	themeId: string;
	onThemeChange: (themeId: string) => void;
	isSystemMode: boolean;
	onSystemModeChange: (enabled: boolean) => void;
	availableThemes: ThemeDefinition[];
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

export function AppearanceTab({
	themeId,
	onThemeChange,
	isSystemMode,
	onSystemModeChange,
	availableThemes,
}: AppearanceTabProps) {
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-3 gap-3">
				{availableThemes.map((theme) => (
					<button
						key={theme.id}
						type="button"
						className={cn(
							"text-left transition-all rounded-lg select-none",
							"hover:ring-2 hover:ring-ring hover:ring-offset-2",
							"focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
							isSystemMode && "opacity-50 pointer-events-none",
						)}
						onClick={() => onThemeChange(theme.id)}
						disabled={isSystemMode}
					>
						<ThemePreview
							theme={theme}
							isSelected={!isSystemMode && themeId === theme.id}
						/>
						<p className="mt-1.5 text-xs font-medium text-center truncate">
							{theme.name}
						</p>
					</button>
				))}
			</div>

			<div className="flex items-center gap-2 pt-2">
				<Checkbox
					id="system-mode"
					checked={isSystemMode}
					onCheckedChange={(checked) => onSystemModeChange(checked === true)}
				/>
				<label
					htmlFor="system-mode"
					className="flex items-center gap-2 text-sm font-medium cursor-pointer"
				>
					<Monitor className="h-4 w-4 text-muted-foreground" />
					Use system preference
				</label>
			</div>
			{isSystemMode && (
				<p className="text-xs text-muted-foreground pl-6">
					Automatically switches between Light and Dark based on your system
					settings
				</p>
			)}
		</div>
	);
}
