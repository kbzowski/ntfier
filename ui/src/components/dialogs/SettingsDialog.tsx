import { Palette, Server, Settings2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ThemeDefinition } from "@/themes";
import type { ServerConfig } from "@/types/ntfy";
import { ServerConfigForm } from "./ServerConfigForm";
import { AppearanceTab, BehaviorTab } from "./settings";

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
	) => Promise<unknown> | undefined;
	onRemoveServer: (url: string) => void;
	onSetDefaultServer: (url: string) => void;
	autostart: boolean;
	onAutostartChange: (enabled: boolean) => void;
	minimizeToTray: boolean;
	onMinimizeToTrayChange: (enabled: boolean) => void;
	startMinimized: boolean;
	onStartMinimizedChange: (enabled: boolean) => void;
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

					<TabsContent value="appearance" className="mt-4">
						<AppearanceTab
							themeId={themeId}
							onThemeChange={onThemeChange}
							isSystemMode={isSystemMode}
							onSystemModeChange={onSystemModeChange}
							availableThemes={availableThemes}
						/>
					</TabsContent>

					<TabsContent value="behavior" className="mt-4">
						<BehaviorTab
							autostart={autostart}
							onAutostartChange={onAutostartChange}
							minimizeToTray={minimizeToTray}
							onMinimizeToTrayChange={onMinimizeToTrayChange}
							startMinimized={startMinimized}
							onStartMinimizedChange={onStartMinimizedChange}
						/>
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
