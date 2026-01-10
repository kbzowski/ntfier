import {
	Check,
	Minimize2,
	Monitor,
	Palette,
	PanelBottomClose,
	Power,
	Server,
	Settings2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ThemeDefinition } from "@/themes";
import type { ServerConfig } from "@/types/ntfy";
import { ServerConfigForm } from "./ServerConfigForm";

interface SettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	themeId: string;
	onThemeChange: (themeId: string) => void;
	isSystemMode: boolean;
	onSystemModeChange: (enabled: boolean) => void;
	availableThemes: ThemeDefinition[];
	servers: ServerConfig[];
	onAddServer: (
		server: Omit<ServerConfig, "isDefault">,
	) => Promise<unknown> | void;
	onRemoveServer: (url: string) => void;
	onSetDefaultServer: (url: string) => void;
	autostart: boolean;
	onAutostartChange: (enabled: boolean) => void;
	minimizeToTray: boolean;
	onMinimizeToTrayChange: (enabled: boolean) => void;
	startMinimized: boolean;
	onStartMinimizedChange: (enabled: boolean) => void;
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
			{/* Preview card */}
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
			{/* Selected checkmark */}
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

export function SettingsDialog({
	open,
	onOpenChange,
	themeId,
	onThemeChange,
	isSystemMode,
	onSystemModeChange,
	availableThemes,
	servers,
	onAddServer,
	onRemoveServer,
	onSetDefaultServer,
	autostart,
	onAutostartChange,
	minimizeToTray,
	onMinimizeToTrayChange,
	startMinimized,
	onStartMinimizedChange,
}: SettingsDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
				</DialogHeader>

				<Tabs defaultValue="appearance">
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="appearance">
							<Palette className="h-4 w-4 mr-1.5" />
							Appearance
						</TabsTrigger>
						<TabsTrigger value="behavior">
							<Settings2 className="h-4 w-4 mr-1.5" />
							Behavior
						</TabsTrigger>
						<TabsTrigger value="servers">
							<Server className="h-4 w-4 mr-1.5" />
							Servers
						</TabsTrigger>
					</TabsList>

					<TabsContent value="appearance" className="space-y-4 mt-4">
						{/* Theme grid */}
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

						{/* System mode checkbox */}
						<div className="flex items-center gap-2 pt-2">
							<Checkbox
								id="system-mode"
								checked={isSystemMode}
								onCheckedChange={(checked) =>
									onSystemModeChange(checked === true)
								}
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
								Automatically switches between Light and Dark based on your
								system settings
							</p>
						)}
					</TabsContent>

					<TabsContent value="behavior" className="space-y-4 mt-4">
						<div className="flex items-center gap-2">
							<Checkbox
								id="autostart"
								checked={autostart}
								onCheckedChange={(checked) =>
									onAutostartChange(checked === true)
								}
							/>
							<label
								htmlFor="autostart"
								className="flex items-center gap-2 text-sm font-medium cursor-pointer"
							>
								<Power className="h-4 w-4 text-muted-foreground" />
								Start with system
							</label>
						</div>
						<p className="text-xs text-muted-foreground pl-6">
							Automatically start Ntfier when you log in to your computer
						</p>

						<div className="flex items-center gap-2 pt-2">
							<Checkbox
								id="minimize-to-tray"
								checked={minimizeToTray}
								onCheckedChange={(checked) =>
									onMinimizeToTrayChange(checked === true)
								}
							/>
							<label
								htmlFor="minimize-to-tray"
								className="flex items-center gap-2 text-sm font-medium cursor-pointer"
							>
								<PanelBottomClose className="h-4 w-4 text-muted-foreground" />
								Minimize to system tray
							</label>
						</div>
						<p className="text-xs text-muted-foreground pl-6">
							When closing the window, minimize to system tray instead of
							quitting
						</p>

						<div className="flex items-center gap-2 pt-2">
							<Checkbox
								id="start-minimized"
								checked={startMinimized}
								onCheckedChange={(checked) =>
									onStartMinimizedChange(checked === true)
								}
							/>
							<label
								htmlFor="start-minimized"
								className="flex items-center gap-2 text-sm font-medium cursor-pointer"
							>
								<Minimize2 className="h-4 w-4 text-muted-foreground" />
								Start minimized
							</label>
						</div>
						<p className="text-xs text-muted-foreground pl-6">
							Start the application minimized to system tray
						</p>
					</TabsContent>

					<TabsContent value="servers" className="mt-4">
						<ServerConfigForm
							servers={servers}
							onAddServer={onAddServer}
							onRemoveServer={onRemoveServer}
							onSetDefault={onSetDefaultServer}
						/>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
