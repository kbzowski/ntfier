import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/common/ThemeProvider";
import { SettingsContent } from "@/components/dialogs/SettingsContent";
import { mockSubscriptions } from "@/data/mock-data";
import { useSettings } from "@/hooks/useSettings";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { validateSettingsSearch } from "@/lib/settingsSearch";
import { isTauri, subscriptionsApi, updateApi } from "@/lib/tauri";
import type { Subscription } from "@/types/bindings";

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: "Ntfier – Settings" }] }),
	validateSearch: validateSettingsSearch,
	component: SettingsWindow,
});

function SettingsWindow() {
	const { themeId, setThemeId, isSystemMode, setSystemMode, availableThemes } =
		useTheme();
	const s = useSettings();
	const { settings, setUpdateInfo } = s;

	// The startup check ran before this window existed, so read its stored result
	useEffect(() => {
		if (!isTauri()) return;
		updateApi
			.getLastCheck()
			.then(setUpdateInfo)
			.catch((err) => console.error("Failed to load update result:", err));
	}, [setUpdateInfo]);

	// `n` remounts the content so an open window's tab and form re-init
	const { editServer } = Route.useSearch();
	const [edit, setEdit] = useState({ url: editServer, n: 0 });
	useTauriEvent<string>("settings:edit-server", (url) =>
		setEdit((e) => ({ url, n: e.n + 1 })),
	);

	// Read-only, for the topic count in the server removal confirmation
	const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
	useEffect(() => {
		if (!isTauri()) {
			setSubscriptions(mockSubscriptions);
			return;
		}
		subscriptionsApi
			.getAll()
			.then(setSubscriptions)
			.catch((err) => console.error("Failed to load subscriptions:", err));
	}, []);

	return (
		<div className="flex h-screen flex-col p-4">
			<SettingsContent
				// The server form reads its server once, so mount it after settings load
				key={s.settingsLoading ? "loading" : edit.n}
				editServerUrl={edit.url}
				themeId={themeId}
				onThemeChange={setThemeId}
				isSystemMode={isSystemMode}
				onSystemModeChange={setSystemMode}
				availableThemes={availableThemes}
				servers={settings.servers}
				onAddServer={s.addServer}
				onUpdateServer={s.updateServer}
				onRemoveServer={s.removeServer}
				onSyncServer={s.syncServer}
				onSetDefaultServer={s.setDefaultServer}
				autostart={s.autostart}
				onAutostartChange={s.setAutostart}
				minimizeToTray={settings.minimizeToTray ?? true}
				onMinimizeToTrayChange={s.setMinimizeToTray}
				startMinimized={settings.startMinimized ?? false}
				onStartMinimizedChange={s.setStartMinimized}
				updateInfo={s.updateInfo}
				onUpdateInfoChange={s.setUpdateInfo}
				notificationMethod={settings.notificationMethod ?? "native"}
				onNotificationMethodChange={s.setNotificationMethod}
				notificationForceDisplay={settings.notificationForceDisplay ?? false}
				onNotificationForceDisplayChange={s.setNotificationForceDisplay}
				notificationShowActions={settings.notificationShowActions ?? true}
				onNotificationShowActionsChange={s.setNotificationShowActions}
				notificationShowImages={settings.notificationShowImages ?? true}
				onNotificationShowImagesChange={s.setNotificationShowImages}
				notificationSound={settings.notificationSound ?? true}
				onNotificationSoundChange={s.setNotificationSound}
				compactView={settings.compactView ?? false}
				onCompactViewChange={s.setCompactView}
				expandNewMessages={settings.expandNewMessages ?? true}
				onExpandNewMessagesChange={s.setExpandNewMessages}
				deleteLocalOnly={settings.deleteLocalOnly ?? true}
				onDeleteLocalOnlyChange={s.setDeleteLocalOnly}
				retentionMaxAgeDays={settings.retentionMaxAgeDays ?? null}
				onRetentionMaxAgeDaysChange={s.setRetentionMaxAgeDays}
				retentionMaxPerSubscription={
					settings.retentionMaxPerSubscription ?? null
				}
				onRetentionMaxPerSubscriptionChange={s.setRetentionMaxPerSubscription}
				favoritesEnabled={settings.favoritesEnabled ?? false}
				onFavoritesEnabledChange={s.setFavoritesEnabled}
				subscriptions={subscriptions}
				ignoreRules={s.ignoreRules}
				onAddIgnoreRule={s.addIgnoreRule}
				onDeleteIgnoreRule={s.deleteIgnoreRule}
			/>
		</div>
	);
}
