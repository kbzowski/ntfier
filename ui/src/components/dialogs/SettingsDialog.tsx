import { Bell, Palette, Server, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ThemeDefinition } from "@/themes";
import {
	commands,
	type NotificationDisplayMethod,
	type UpdateInfo,
} from "@/types/bindings";
import type { ServerConfig } from "@/types/ntfy";
import { ServerConfigForm } from "./ServerConfigForm";
import { AppearanceTab, BehaviorTab, NotificationsTab } from "./settings";

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
	updateInfo: UpdateInfo | null;
	onUpdateInfoChange: (info: UpdateInfo | null) => void;
	notificationMethod: NotificationDisplayMethod;
	onNotificationMethodChange: (method: NotificationDisplayMethod) => void;
	notificationForceDisplay: boolean;
	onNotificationForceDisplayChange: (enabled: boolean) => void;
	notificationShowActions: boolean;
	onNotificationShowActionsChange: (enabled: boolean) => void;
	notificationShowImages: boolean;
	onNotificationShowImagesChange: (enabled: boolean) => void;
	notificationSound: boolean;
	onNotificationSoundChange: (enabled: boolean) => void;
	compactView: boolean;
	onCompactViewChange: (enabled: boolean) => void;
	expandNewMessages: boolean;
	onExpandNewMessagesChange: (enabled: boolean) => void;
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
	updateInfo,
	onUpdateInfoChange,
	notificationMethod,
	onNotificationMethodChange,
	notificationForceDisplay,
	onNotificationForceDisplayChange,
	notificationShowActions,
	onNotificationShowActionsChange,
	notificationShowImages,
	onNotificationShowImagesChange,
	notificationSound,
	onNotificationSoundChange,
	compactView,
	onCompactViewChange,
	expandNewMessages,
	onExpandNewMessagesChange,
}: SettingsDialogProps) {
	const [version, setVersion] = useState<string>("");

	useEffect(() => {
		if (open) {
			commands.getAppVersionDisplay().then(setVersion);
		}
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
				</DialogHeader>

				<Tabs defaultValue="appearance">
					<TabsList className="grid w-full grid-cols-4">
						<TabsTrigger value="appearance">
							<Palette className="h-4 w-4 mr-1.5" />
							Appearance
						</TabsTrigger>
						<TabsTrigger value="behavior">
							<Settings2 className="h-4 w-4 mr-1.5" />
							Behavior
						</TabsTrigger>
						<TabsTrigger value="notifications">
							<Bell className="h-4 w-4 mr-1.5" />
							Notifications
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
							compactView={compactView}
							onCompactViewChange={onCompactViewChange}
							expandNewMessages={expandNewMessages}
							onExpandNewMessagesChange={onExpandNewMessagesChange}
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
							updateInfo={updateInfo}
							onUpdateInfoChange={onUpdateInfoChange}
						/>
					</TabsContent>

					<TabsContent value="notifications" className="mt-4">
						<NotificationsTab
							notificationMethod={notificationMethod}
							onNotificationMethodChange={onNotificationMethodChange}
							notificationForceDisplay={notificationForceDisplay}
							onNotificationForceDisplayChange={
								onNotificationForceDisplayChange
							}
							notificationShowActions={notificationShowActions}
							onNotificationShowActionsChange={onNotificationShowActionsChange}
							notificationShowImages={notificationShowImages}
							onNotificationShowImagesChange={onNotificationShowImagesChange}
							notificationSound={notificationSound}
							onNotificationSoundChange={onNotificationSoundChange}
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

				<div className="mt-4 pt-3 border-t text-center text-xs text-muted-foreground">
					Ntfier {version}
				</div>
			</DialogContent>
		</Dialog>
	);
}
