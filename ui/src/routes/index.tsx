import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useTheme } from "@/components/common/ThemeProvider";
import { UpdateToast } from "@/components/common/UpdateToast";
import { AddSubscriptionDialog } from "@/components/dialogs/AddSubscriptionDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationList } from "@/components/notifications/NotificationList";
import { useApp } from "@/context/AppContext";

export const Route = createFileRoute("/")({ component: App });

function App() {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [addSubscriptionOpen, setAddSubscriptionOpen] = useState(false);
	const [confirmDialog, setConfirmDialog] = useState<{
		open: boolean;
		topicId: string | null;
	}>({ open: false, topicId: null });

	const { themeId, setThemeId, isSystemMode, setSystemMode, availableThemes } =
		useTheme();

	const {
		subscriptionsWithUnread,
		currentTopicId,
		setCurrentTopicId,
		currentNotifications,
		addSubscription,
		removeSubscription,
		toggleMute,
		markAsRead,
		markAllAsRead,
		markAllAsReadGlobally,
		settings,
		addServer,
		removeServer,
		setDefaultServer,
		autostart,
		setAutostart,
		setMinimizeToTray,
		setStartMinimized,
		updateInfo,
		setUpdateInfo,
	} = useApp();

	const selectedSubscription = subscriptionsWithUnread.find(
		(sub) => sub.id === currentTopicId,
	);

	const handleAddServer = useCallback(
		async (server: Parameters<typeof addServer>[0]) => {
			const syncedSubs = await addServer(server);
			if (syncedSubs.length > 0) {
				setCurrentTopicId(syncedSubs[0].id);
			}
		},
		[addServer, setCurrentTopicId],
	);

	const handleRemoveSubscription = useCallback((id: string) => {
		setConfirmDialog({ open: true, topicId: id });
	}, []);

	const handleConfirmRemove = useCallback(() => {
		if (confirmDialog.topicId) {
			removeSubscription(confirmDialog.topicId);
			if (currentTopicId === confirmDialog.topicId) {
				setCurrentTopicId(null);
			}
		}
		setConfirmDialog({ open: false, topicId: null });
	}, [
		confirmDialog.topicId,
		removeSubscription,
		currentTopicId,
		setCurrentTopicId,
	]);

	const handleAddSubscription = useCallback(
		async (topic: string, serverUrl: string, displayName?: string) => {
			const newSub = await addSubscription({ topic, serverUrl, displayName });
			setCurrentTopicId(newSub.id);
		},
		[addSubscription, setCurrentTopicId],
	);

	const handleMarkAllAsRead = useCallback(() => {
		if (currentTopicId) {
			markAllAsRead(currentTopicId);
		} else {
			// In "All notifications" view - mark all across all topics
			markAllAsReadGlobally();
		}
	}, [markAllAsRead, markAllAsReadGlobally, currentTopicId]);

	return (
		<>
			<AppLayout
				subscriptions={subscriptionsWithUnread}
				selectedTopicId={currentTopicId}
				onSelectTopic={setCurrentTopicId}
				onToggleMute={toggleMute}
				onRemoveSubscription={handleRemoveSubscription}
				onOpenSettings={() => setSettingsOpen(true)}
				onAddSubscription={() => setAddSubscriptionOpen(true)}
			>
				<NotificationList
					subscription={selectedSubscription ?? null}
					subscriptions={subscriptionsWithUnread}
					notifications={currentNotifications}
					onMarkAsRead={markAsRead}
					onMarkAllAsRead={handleMarkAllAsRead}
				/>
			</AppLayout>

			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				themeId={themeId}
				onThemeChange={setThemeId}
				isSystemMode={isSystemMode}
				onSystemModeChange={setSystemMode}
				availableThemes={availableThemes}
				servers={settings.servers}
				onAddServer={handleAddServer}
				onRemoveServer={removeServer}
				onSetDefaultServer={setDefaultServer}
				autostart={autostart}
				onAutostartChange={setAutostart}
				minimizeToTray={settings.minimizeToTray ?? true}
				onMinimizeToTrayChange={setMinimizeToTray}
				startMinimized={settings.startMinimized ?? false}
				onStartMinimizedChange={setStartMinimized}
				updateInfo={updateInfo}
				onUpdateInfoChange={setUpdateInfo}
			/>

			<AddSubscriptionDialog
				open={addSubscriptionOpen}
				onOpenChange={setAddSubscriptionOpen}
				servers={settings.servers}
				defaultServer={settings.defaultServer}
				onAdd={handleAddSubscription}
			/>

			<ConfirmDialog
				open={confirmDialog.open}
				onOpenChange={(open) =>
					setConfirmDialog({
						open,
						topicId: open ? confirmDialog.topicId : null,
					})
				}
				title="Unsubscribe from topic"
				description="Are you sure you want to unsubscribe from this topic? You will no longer receive notifications for it."
				confirmLabel="Unsubscribe"
				variant="destructive"
				onConfirm={handleConfirmRemove}
			/>

			<UpdateToast
				updateInfo={updateInfo}
				onOpenSettings={() => setSettingsOpen(true)}
				onDismiss={() => {}}
			/>
		</>
	);
}
