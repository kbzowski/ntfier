import { Bell, EyeOff, Palette, Server, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { countServerSubscriptions } from "@/lib/serverSubscriptions";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { ThemeDefinition } from "@/themes";
import {
	commands,
	type IgnoreRule,
	type NotificationDisplayMethod,
	type Subscription,
	type UpdateInfo,
} from "@/types/bindings";
import type { ServerConfig } from "@/types/ntfy";
import { ConfirmDialog } from "./ConfirmDialog";
import { ServerConfigForm } from "./ServerConfigForm";
import {
	AppearanceTab,
	BehaviorTab,
	IgnoredTab,
	NotificationsTab,
} from "./settings";

export interface SettingsContentProps {
	themeId: string;
	onThemeChange: (themeId: string) => void;
	isSystemMode: boolean;
	onSystemModeChange: (enabled: boolean) => void;
	availableThemes: ThemeDefinition[];
	servers: ServerConfig[];
	onAddServer: (
		server: Omit<ServerConfig, "isDefault">,
	) => Promise<unknown> | undefined;
	onUpdateServer: (
		server: Omit<ServerConfig, "isDefault">,
	) => Promise<unknown> | undefined;
	/** Opens straight on this server's login (Servers tab). */
	editServerUrl?: string | null;
	/** Called once the user confirms the removal. */
	onRemoveServer: (url: string) => void;
	onSyncServer: (url: string) => Promise<void>;
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
	deleteLocalOnly: boolean;
	onDeleteLocalOnlyChange: (enabled: boolean) => void;
	retentionMaxAgeDays: number | null;
	onRetentionMaxAgeDaysChange: (days: number | null) => void;
	retentionMaxPerSubscription: number | null;
	onRetentionMaxPerSubscriptionChange: (max: number | null) => void;
	favoritesEnabled: boolean;
	onFavoritesEnabledChange: (enabled: boolean) => void;
	subscriptions: Subscription[];
	ignoreRules: IgnoreRule[];
	onAddIgnoreRule: (
		pattern: string,
		subscriptionId: string | null,
	) => Promise<void>;
	onDeleteIgnoreRule: (id: string) => Promise<void>;
}

export function SettingsContent({
	themeId,
	onThemeChange,
	isSystemMode,
	onSystemModeChange,
	availableThemes,
	servers,
	onAddServer,
	onUpdateServer,
	editServerUrl,
	onRemoveServer,
	onSyncServer,
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
	deleteLocalOnly,
	onDeleteLocalOnlyChange,
	retentionMaxAgeDays,
	onRetentionMaxAgeDaysChange,
	retentionMaxPerSubscription,
	onRetentionMaxPerSubscriptionChange,
	favoritesEnabled,
	onFavoritesEnabledChange,
	subscriptions,
	ignoreRules,
	onAddIgnoreRule,
	onDeleteIgnoreRule,
}: SettingsContentProps) {
	const [version, setVersion] = useState<string>("");
	const [serverToRemove, setServerToRemove] = useState<string | null>(null);
	const serverToRemoveSubscriptions = serverToRemove
		? countServerSubscriptions(subscriptions, serverToRemove)
		: 0;

	useEffect(() => {
		commands.getAppVersionDisplay().then(setVersion);
	}, []);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<Tabs
				defaultValue={editServerUrl ? "servers" : "appearance"}
				className="@container min-h-0 flex-1"
			>
				<TabsList
					className={cn(
						"grid w-full shrink-0",
						isTauri() ? "grid-cols-5" : "grid-cols-4",
					)}
				>
					<TabsTrigger value="appearance">
						<Palette className="h-4 w-4 @xl:mr-1.5" />
						<span className="sr-only @xl:not-sr-only">Appearance</span>
					</TabsTrigger>
					<TabsTrigger value="behavior">
						<Settings2 className="h-4 w-4 @xl:mr-1.5" />
						<span className="sr-only @xl:not-sr-only">Behavior</span>
					</TabsTrigger>
					<TabsTrigger value="notifications">
						<Bell className="h-4 w-4 @xl:mr-1.5" />
						<span className="sr-only @xl:not-sr-only">Notifications</span>
					</TabsTrigger>
					{isTauri() ? (
						<TabsTrigger value="ignored">
							<EyeOff className="h-4 w-4 @xl:mr-1.5" />
							<span className="sr-only @xl:not-sr-only">Ignored</span>
						</TabsTrigger>
					) : null}
					<TabsTrigger value="servers">
						<Server className="h-4 w-4 @xl:mr-1.5" />
						<span className="sr-only @xl:not-sr-only">Servers</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent
					value="appearance"
					className="mt-4 min-h-0 overflow-y-auto"
				>
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
						favoritesEnabled={favoritesEnabled}
						onFavoritesEnabledChange={onFavoritesEnabledChange}
					/>
				</TabsContent>

				<TabsContent value="behavior" className="mt-4 min-h-0 overflow-y-auto">
					<BehaviorTab
						autostart={autostart}
						onAutostartChange={onAutostartChange}
						minimizeToTray={minimizeToTray}
						onMinimizeToTrayChange={onMinimizeToTrayChange}
						startMinimized={startMinimized}
						onStartMinimizedChange={onStartMinimizedChange}
						deleteLocalOnly={deleteLocalOnly}
						onDeleteLocalOnlyChange={onDeleteLocalOnlyChange}
						retentionMaxAgeDays={retentionMaxAgeDays}
						onRetentionMaxAgeDaysChange={onRetentionMaxAgeDaysChange}
						retentionMaxPerSubscription={retentionMaxPerSubscription}
						onRetentionMaxPerSubscriptionChange={
							onRetentionMaxPerSubscriptionChange
						}
						updateInfo={updateInfo}
						onUpdateInfoChange={onUpdateInfoChange}
					/>
				</TabsContent>

				<TabsContent
					value="notifications"
					className="mt-4 min-h-0 overflow-y-auto"
				>
					<NotificationsTab
						notificationMethod={notificationMethod}
						onNotificationMethodChange={onNotificationMethodChange}
						notificationForceDisplay={notificationForceDisplay}
						onNotificationForceDisplayChange={onNotificationForceDisplayChange}
						notificationShowActions={notificationShowActions}
						onNotificationShowActionsChange={onNotificationShowActionsChange}
						notificationShowImages={notificationShowImages}
						onNotificationShowImagesChange={onNotificationShowImagesChange}
						notificationSound={notificationSound}
						onNotificationSoundChange={onNotificationSoundChange}
					/>
				</TabsContent>

				{isTauri() ? (
					<TabsContent value="ignored" className="mt-4 min-h-0 overflow-y-auto">
						<IgnoredTab
							rules={ignoreRules}
							subscriptions={subscriptions}
							onAdd={onAddIgnoreRule}
							onDelete={onDeleteIgnoreRule}
						/>
					</TabsContent>
				) : null}

				<TabsContent value="servers" className="mt-4 min-h-0 overflow-y-auto">
					<ServerConfigForm
						servers={servers}
						onAddServer={onAddServer}
						onUpdateServer={onUpdateServer}
						editUrl={editServerUrl}
						onRemoveServer={setServerToRemove}
						onSyncServer={onSyncServer}
						onSetDefault={onSetDefaultServer}
					/>
				</TabsContent>
			</Tabs>

			<div className="shrink-0 pt-3 border-t text-center text-xs text-muted-foreground">
				Ntfier {version}
			</div>

			<ConfirmDialog
				open={serverToRemove !== null}
				onOpenChange={(open) => {
					if (!open) setServerToRemove(null);
				}}
				title="Remove server?"
				description={`Its ${serverToRemoveSubscriptions} topic${serverToRemoveSubscriptions === 1 ? "" : "s"} and their messages are deleted.`}
				confirmLabel="Remove"
				variant="destructive"
				onConfirm={() => {
					if (serverToRemove) onRemoveServer(serverToRemove);
					setServerToRemove(null);
				}}
			/>
		</div>
	);
}
