import { createFileRoute } from "@tanstack/react-router";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/common/ThemeProvider";
import { UpdateToast } from "@/components/common/UpdateToast";
import { AddSubscriptionDialog } from "@/components/dialogs/AddSubscriptionDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { AppLayout } from "@/components/layout/AppLayout";
import { ServerStatusBanner } from "@/components/layout/ServerStatusBanner";
import { ErrorCard } from "@/components/ui/error-card";

const SettingsDialog = lazy(() =>
	import("@/components/dialogs/SettingsDialog").then((m) => ({
		default: m.SettingsDialog,
	})),
);

import { NotificationList } from "@/components/notifications/NotificationList";
import { AppProvider, useApp } from "@/context/AppContext";
import { ShowImagesProvider } from "@/context/ShowImagesContext";
import { classifyError } from "@/lib/error-classification";
import { isTauri, settingsApi } from "@/lib/tauri";

const noop = () => {};

function openSettingsWindow(editServerUrl?: string) {
	settingsApi.openWindow(editServerUrl).catch((err) => {
		toast.error(classifyError(err).userMessage, {
			description: "Couldn't open settings",
		});
	});
}

export const Route = createFileRoute("/")({ component: MainWindow });

function MainWindow() {
	return (
		<AppProvider>
			<App />
		</AppProvider>
	);
}

function App() {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [editServerUrl, setEditServerUrl] = useState<string | null>(null);
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
		deleteNotification,
		toggleFavorite,
		setNotificationExpanded,
		currentView,
		setCurrentView,
		favoritesCount,
		settings,
		setFavoritesEnabled,
		addServer,
		removeServer,
		setDefaultServer,
		autostart,
		setAutostart,
		setMinimizeToTray,
		setStartMinimized,
		setNotificationMethod,
		setNotificationForceDisplay,
		setNotificationShowActions,
		setNotificationShowImages,
		setNotificationSound,
		setCompactView,
		setExpandNewMessages,
		setDeleteLocalOnly,
		setRetentionMaxAgeDays,
		setRetentionMaxPerSubscription,
		updateInfo,
		setUpdateInfo,
		loadError,
		retryLoad,
		serverStatuses,
		updateServer,
		syncServer,
		ignoreRules,
		addIgnoreRule,
		deleteIgnoreRule,
	} = useApp();

	const currentTopicIdRef = useRef(currentTopicId);
	useEffect(() => {
		currentTopicIdRef.current = currentTopicId;
	}, [currentTopicId]);

	const selectedSubscription = subscriptionsWithUnread.find(
		(sub) => sub.id === currentTopicId,
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

	const handleOpenSettings = useCallback(() => {
		if (isTauri()) openSettingsWindow();
		else setSettingsOpen(true);
	}, []);
	const handleSettingsOpenChange = useCallback((open: boolean) => {
		setSettingsOpen(open);
		if (!open) setEditServerUrl(null);
	}, []);
	const handleEditServer = useCallback((url: string) => {
		if (isTauri()) {
			openSettingsWindow(url);
			return;
		}
		setEditServerUrl(url);
		setSettingsOpen(true);
	}, []);
	const handleOpenAddSubscription = useCallback(
		() => setAddSubscriptionOpen(true),
		[],
	);

	const handleMarkAllAsRead = useCallback(() => {
		const topicId = currentTopicIdRef.current;
		if (topicId) {
			markAllAsRead(topicId);
		} else {
			// In "All notifications" view - mark all across all topics
			markAllAsReadGlobally();
		}
	}, [markAllAsRead, markAllAsReadGlobally]);

	return (
		<>
			<AppLayout
				subscriptions={subscriptionsWithUnread}
				selectedTopicId={currentTopicId}
				currentView={currentView}
				favoritesCount={favoritesCount}
				favoritesEnabled={settings.favoritesEnabled ?? false}
				onSelectTopic={setCurrentTopicId}
				onSelectView={setCurrentView}
				onToggleMute={toggleMute}
				onRemoveSubscription={handleRemoveSubscription}
				onOpenSettings={handleOpenSettings}
				onAddSubscription={handleOpenAddSubscription}
			>
				<ServerStatusBanner
					statuses={serverStatuses}
					onEditServer={handleEditServer}
				/>
				{loadError ? (
					<ErrorCard
						className="m-6"
						message="Couldn't load your data"
						details={loadError}
						onRetry={retryLoad}
					/>
				) : (
					<ShowImagesProvider value={settings.notificationShowImages ?? true}>
						<NotificationList
							subscription={
								currentView === "favorites"
									? null
									: (selectedSubscription ?? null)
							}
							subscriptions={subscriptionsWithUnread}
							notifications={currentNotifications}
							onMarkAsRead={markAsRead}
							onMarkAllAsRead={handleMarkAllAsRead}
							onDelete={deleteNotification}
							onToggleFavorite={
								settings.favoritesEnabled ? toggleFavorite : undefined
							}
							onExpandedChange={setNotificationExpanded}
							compactView={settings.compactView ?? false}
							isFavoritesView={currentView === "favorites"}
						/>
					</ShowImagesProvider>
				)}
			</AppLayout>

			{isTauri() ? null : (
				<Suspense fallback={null}>
					<SettingsDialog
						open={settingsOpen}
						onOpenChange={handleSettingsOpenChange}
						themeId={themeId}
						onThemeChange={setThemeId}
						isSystemMode={isSystemMode}
						onSystemModeChange={setSystemMode}
						availableThemes={availableThemes}
						servers={settings.servers}
						onAddServer={addServer}
						onUpdateServer={updateServer}
						editServerUrl={editServerUrl}
						onRemoveServer={removeServer}
						onSyncServer={syncServer}
						onSetDefaultServer={setDefaultServer}
						autostart={autostart}
						onAutostartChange={setAutostart}
						minimizeToTray={settings.minimizeToTray ?? true}
						onMinimizeToTrayChange={setMinimizeToTray}
						startMinimized={settings.startMinimized ?? false}
						onStartMinimizedChange={setStartMinimized}
						updateInfo={updateInfo}
						onUpdateInfoChange={setUpdateInfo}
						notificationMethod={settings.notificationMethod ?? "native"}
						onNotificationMethodChange={setNotificationMethod}
						notificationForceDisplay={
							settings.notificationForceDisplay ?? false
						}
						onNotificationForceDisplayChange={setNotificationForceDisplay}
						notificationShowActions={settings.notificationShowActions ?? true}
						onNotificationShowActionsChange={setNotificationShowActions}
						notificationShowImages={settings.notificationShowImages ?? true}
						onNotificationShowImagesChange={setNotificationShowImages}
						notificationSound={settings.notificationSound ?? true}
						onNotificationSoundChange={setNotificationSound}
						compactView={settings.compactView ?? false}
						onCompactViewChange={setCompactView}
						expandNewMessages={settings.expandNewMessages ?? true}
						onExpandNewMessagesChange={setExpandNewMessages}
						deleteLocalOnly={settings.deleteLocalOnly ?? true}
						onDeleteLocalOnlyChange={setDeleteLocalOnly}
						retentionMaxAgeDays={settings.retentionMaxAgeDays ?? null}
						onRetentionMaxAgeDaysChange={setRetentionMaxAgeDays}
						retentionMaxPerSubscription={
							settings.retentionMaxPerSubscription ?? null
						}
						onRetentionMaxPerSubscriptionChange={setRetentionMaxPerSubscription}
						favoritesEnabled={settings.favoritesEnabled ?? false}
						onFavoritesEnabledChange={setFavoritesEnabled}
						subscriptions={subscriptionsWithUnread}
						ignoreRules={ignoreRules}
						onAddIgnoreRule={addIgnoreRule}
						onDeleteIgnoreRule={deleteIgnoreRule}
					/>
				</Suspense>
			)}

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
				onOpenSettings={handleOpenSettings}
				onDismiss={noop}
			/>
		</>
	);
}
