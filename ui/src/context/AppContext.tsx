import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { mockSettings, mockSubscriptions } from "@/data/mock-data";
import { useNotifications } from "@/hooks/useNotifications";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { BackendError, classifyError } from "@/lib/error-classification";
import {
	autostartApi,
	ignoreRulesApi,
	isTauri,
	notificationsApi,
	settingsApi,
	subscriptionsApi,
	syncApi,
} from "@/lib/tauri";
import type { IgnoreRule, ServerStatusEntry } from "@/types/bindings";

/** Payload of the backend's `subscription:error` event. */
type SubscriptionError = { id: string; message: string | null };

import type {
	AppSettings,
	Notification,
	NotificationDisplayMethod,
	ServerConfig,
	Subscription,
	ThemeMode,
	UpdateInfo,
} from "@/types/ntfy";

interface AppState {
	// Subscriptions
	subscriptions: Subscription[];
	subscriptionsLoading: boolean;

	// Ignore rules
	ignoreRules: IgnoreRule[];

	// Notifications (keyed by subscription ID)
	notificationsByTopic: Map<string, Notification[]>;
	currentTopicId: string | null;
	currentView: "all" | "favorites";

	// Settings
	settings: AppSettings;
	settingsLoading: boolean;
	autostart: boolean;

	// Updates
	updateInfo: UpdateInfo | null;

	// Startup load failure, shown instead of the list
	loadError: string | null;

	// Servers blocked from connecting, and per-subscription connection errors
	serverStatuses: ServerStatusEntry[];
}

interface AppActions {
	retryLoad: () => Promise<void>;

	// Subscriptions
	addSubscription: (subscription: {
		topic: string;
		serverUrl: string;
		displayName?: string;
	}) => Promise<Subscription>;
	removeSubscription: (id: string, localOnly?: boolean) => Promise<void>;
	toggleMute: (id: string) => Promise<void>;
	refreshSubscriptions: () => Promise<void>;

	// Ignore rules
	addIgnoreRule: (
		pattern: string,
		subscriptionId: string | null,
	) => Promise<void>;
	deleteIgnoreRule: (id: string) => Promise<void>;

	// Topic selection
	setCurrentTopicId: (id: string | null) => void;

	// View selection
	setCurrentView: (view: "all" | "favorites") => void;

	// Notifications (optimistic updates - fire and forget)
	markAsRead: (id: string) => void;
	markAllAsRead: (subscriptionId: string) => void;
	markAllAsReadGlobally: () => void;
	deleteNotification: (id: string) => void;
	toggleFavorite: (id: string) => void;
	setNotificationExpanded: (id: string, expanded: boolean) => void;
	getUnreadCount: (subscriptionId: string) => number;
	getTotalUnread: () => number;

	// Settings
	setTheme: (theme: ThemeMode) => Promise<void>;
	addServer: (
		server: Omit<ServerConfig, "isDefault">,
	) => Promise<Subscription[]>;
	updateServer: (server: Omit<ServerConfig, "isDefault">) => Promise<void>;
	syncServer: (url: string) => Promise<void>;
	removeServer: (url: string) => Promise<void>;
	setDefaultServer: (url: string) => Promise<void>;
	setAutostart: (enabled: boolean) => Promise<void>;
	setMinimizeToTray: (enabled: boolean) => Promise<void>;
	setStartMinimized: (enabled: boolean) => Promise<void>;

	// Notification settings
	setNotificationMethod: (method: NotificationDisplayMethod) => Promise<void>;
	setNotificationForceDisplay: (enabled: boolean) => Promise<void>;
	setNotificationShowActions: (enabled: boolean) => Promise<void>;
	setNotificationShowImages: (enabled: boolean) => Promise<void>;
	setNotificationSound: (enabled: boolean) => Promise<void>;

	// Message display settings
	setCompactView: (enabled: boolean) => Promise<void>;
	setExpandNewMessages: (enabled: boolean) => Promise<void>;

	// Deletion settings
	setDeleteLocalOnly: (enabled: boolean) => Promise<void>;
	setRetentionMaxAgeDays: (days: number | null) => Promise<void>;

	// Favorites settings
	setFavoritesEnabled: (enabled: boolean) => Promise<void>;

	// Updates
	setUpdateInfo: (info: UpdateInfo | null) => void;
}

interface AppContextValue extends AppState, AppActions {
	// Derived data
	currentNotifications: Notification[];
	subscriptionsWithUnread: Subscription[];
	favoritesCount: number;
}

const AppContext = createContext<AppContextValue | null>(null);

const emptySettings: AppSettings = { ...mockSettings, servers: [] };

type SetSettings = Dispatch<SetStateAction<AppSettings>>;

/**
 * Factory for boolean setting setters that follow the same pattern:
 * call API → update local state → show toast → handle errors.
 */
function makeBooleanSettingSetter(
	setSettings: SetSettings,
	key: keyof AppSettings,
	apiCall: (enabled: boolean) => Promise<unknown>,
	label?: string,
	onSuccess?: (enabled: boolean) => void,
): (enabled: boolean) => Promise<void> {
	return async (enabled: boolean) => {
		if (!isTauri()) return;
		try {
			await apiCall(enabled);
			setSettings((prev) => ({ ...prev, [key]: enabled }));
			if (label) toast.success(`${label} ${enabled ? "enabled" : "disabled"}`);
			onSuccess?.(enabled);
		} catch (err) {
			const classified = classifyError(err);
			toast.error(classified.userMessage);
			console.error("[Settings Error]", err);
		}
	};
}

export function AppProvider({ children }: { children: ReactNode }) {
	// State
	const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
	const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
	const [ignoreRules, setIgnoreRules] = useState<IgnoreRule[]>([]);
	const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);
	const [currentView, setCurrentView] = useState<"all" | "favorites">("all");
	const [settings, setSettings] = useState<AppSettings>(() =>
		isTauri() ? emptySettings : mockSettings,
	);
	const [settingsLoading, setSettingsLoading] = useState(true);
	const [autostart, setAutostartState] = useState(false);
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [serverStatuses, setServerStatuses] = useState<ServerStatusEntry[]>([]);
	const [subscriptionErrors, setSubscriptionErrors] = useState<
		Record<string, string>
	>({});

	const refreshIgnoreRules = useCallback(async () => {
		try {
			if (isTauri()) {
				setIgnoreRules(await ignoreRulesApi.getAll());
			}
		} catch (err) {
			console.error("Failed to refresh ignore rules:", err);
		}
	}, []);

	// Notification management via custom hook
	const notifications = useNotifications(subscriptions);

	// Load initial data
	const loadData = useCallback(async () => {
		setLoadError(null);
		try {
			if (isTauri()) {
				// Load all data in parallel to avoid waterfall
				const [subs, loadedSettings, autostartEnabled, statuses] =
					await Promise.all([
						subscriptionsApi.getAll(),
						settingsApi.get(),
						autostartApi.isEnabled(),
						settingsApi.getServerStatuses(),
					]);

				setSubscriptions(subs);
				setSettings(loadedSettings);
				setAutostartState(autostartEnabled);
				setServerStatuses(statuses);
			} else {
				setSubscriptions(mockSubscriptions);
				setSettings(mockSettings);
			}
		} catch (err) {
			console.error("Failed to load initial data:", err);
			setLoadError(classifyError(err).userMessage);
		} finally {
			setSubscriptionsLoading(false);
			setSettingsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
		refreshIgnoreRules();
	}, [loadData, refreshIgnoreRules]);

	// Stable key that only changes when subscription IDs change
	const subscriptionIds = useMemo(
		() => subscriptions.map((s) => s.id).join(","),
		[subscriptions],
	);

	// Keep a ref to subscriptions so the effect can read the latest value
	// without depending on the full array
	const subscriptionsRef = useRef(subscriptions);
	useEffect(() => {
		subscriptionsRef.current = subscriptions;
	}, [subscriptions]);

	// Load notifications when topic changes or subscription list changes.
	// subscriptionIds is intentionally in deps to trigger re-fetch when
	// subscriptions are added/removed, while subscriptionsRef avoids
	// re-triggering on mute/unread changes.
	useEffect(() => {
		if (currentTopicId) {
			notifications.loadForTopic(currentTopicId);
		} else if (subscriptionIds) {
			notifications.loadAllTopics(subscriptionsRef.current);
		}
	}, [
		currentTopicId,
		notifications.loadForTopic,
		notifications.loadAllTopics,
		subscriptionIds,
	]);

	// Listen for new notifications from backend
	useTauriEvent<Notification>(
		"notification:new",
		useCallback(
			(notification: Notification) => {
				// Auto-expand new notifications in compact view if enabled
				if (settings.compactView && settings.expandNewMessages) {
					notification.isExpanded = true;
					notificationsApi.setExpanded(notification.id, true).catch((err) => {
						console.error("[Background] Failed to persist expand state:", err);
					});
				}
				notifications.addNotification(notification);
			},
			[
				settings.compactView,
				settings.expandNewMessages,
				notifications.addNotification,
			],
		),
	);

	// Listen for subscriptions sync completion (backend syncs on startup)
	useTauriEvent<void>(
		"subscriptions:synced",
		useCallback(async () => {
			const subs = await subscriptionsApi.getAll();
			// Account sync can remove topics: drop their cached messages and selection
			const ids = new Set(subs.map((s) => s.id));
			for (const old of subscriptionsRef.current) {
				if (!ids.has(old.id)) notifications.clearTopic(old.id);
			}
			setCurrentTopicId((current) =>
				current && !ids.has(current) ? null : current,
			);
			setSubscriptions(subs);
		}, [notifications.clearTopic]),
	);

	// Retention removed notifications: reload loaded lists and unread counts
	useTauriEvent<void>(
		"notifications:retained",
		useCallback(async () => {
			await notifications.reloadLoaded();
			setSubscriptions(await subscriptionsApi.getAll());
		}, [notifications.reloadLoaded]),
	);

	// Stored messages of a subscription changed in place (update, server delete or clear)
	useTauriEvent<string>(
		"subscription:changed",
		useCallback(
			async (subscriptionId: string) => {
				await notifications.reloadTopic(subscriptionId);
				setSubscriptions(await subscriptionsApi.getAll());
			},
			[notifications.reloadTopic],
		),
	);

	useTauriEvent<ServerStatusEntry>(
		"server:status",
		useCallback((entry: ServerStatusEntry) => {
			setServerStatuses((prev) => [
				...prev.filter((s) => s.url !== entry.url),
				...(entry.status.kind === "ok" ? [] : [entry]),
			]);
		}, []),
	);

	useTauriEvent<SubscriptionError>(
		"subscription:error",
		useCallback(({ id, message }: SubscriptionError) => {
			setSubscriptionErrors((prev) => {
				const { [id]: _, ...rest } = prev;
				return message ? { ...rest, [id]: message } : rest;
			});
		}, []),
	);

	// Listen for navigate:subscription event (from tray icon click)
	useTauriEvent<string>(
		"navigate:subscription",
		useCallback((subscriptionId: string) => {
			console.log("Navigating to subscription:", subscriptionId);
			setCurrentTopicId(subscriptionId);
		}, []),
	);

	// Listen for update:available event (from startup update check)
	useTauriEvent<UpdateInfo>(
		"update:available",
		useCallback((info: UpdateInfo) => {
			console.log("Update available:", info.version);
			setUpdateInfo(info);
		}, []),
	);

	// Subscription actions
	const addSubscription = useCallback(
		async (subscription: {
			topic: string;
			serverUrl: string;
			displayName?: string;
		}) => {
			if (isTauri()) {
				const newSub = await subscriptionsApi.add(subscription);
				// An account sync may have listed it already
				setSubscriptions((prev) =>
					prev.some((s) => s.id === newSub.id) ? prev : [...prev, newSub],
				);
				return newSub;
			}
			const newSub: Subscription = {
				...subscription,
				id: `sub-${Date.now()}`,
				displayName: subscription.displayName ?? null,
				unreadCount: 0,
				lastNotification: null,
				muted: false,
			};
			setSubscriptions((prev) => [...prev, newSub]);
			return newSub;
		},
		[],
	);

	const removeSubscription = useCallback(
		async function remove(id: string, localOnly = false) {
			if (isTauri()) {
				try {
					await subscriptionsApi.remove(id, localOnly);
					setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
					notifications.clearTopic(id);
					toast.success("Subscription removed");
				} catch (err) {
					if (err instanceof BackendError && err.kind === "AccountSync") {
						toast.error(err.message, {
							description:
								"Removing it only here means it comes back on the next sync.",
							action: {
								label: "Remove locally anyway",
								onClick: () => remove(id, true),
							},
						});
						return;
					}
					const classified = classifyError(err);
					toast.error(classified.userMessage, {
						description: "Failed to remove subscription",
					});
					console.error("[Remove subscription error]", err);
				}
			} else {
				setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
				notifications.clearTopic(id);
			}
		},
		[notifications.clearTopic],
	);

	const toggleMute = useCallback(async (id: string) => {
		if (isTauri()) {
			const previousSubscriptions = subscriptionsRef.current;
			// Optimistic update
			setSubscriptions((prev) =>
				prev.map((sub) =>
					sub.id === id ? { ...sub, muted: !sub.muted } : sub,
				),
			);

			try {
				const updated = await subscriptionsApi.toggleMute(id);
				setSubscriptions((prev) =>
					prev.map((sub) => (sub.id === id ? updated : sub)),
				);
				toast.success(updated.muted ? "Topic muted" : "Topic unmuted");
			} catch (err) {
				// Rollback on error
				setSubscriptions(previousSubscriptions);
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Failed to toggle mute",
				});
				console.error("[Toggle mute error]", err);
			}
		} else {
			setSubscriptions((prev) =>
				prev.map((sub) =>
					sub.id === id ? { ...sub, muted: !sub.muted } : sub,
				),
			);
		}
	}, []);

	const refreshSubscriptions = useCallback(async () => {
		try {
			if (isTauri()) {
				const subs = await subscriptionsApi.getAll();
				setSubscriptions(subs);
			}
		} catch (err) {
			console.error("Failed to refresh subscriptions:", err);
		}
	}, []);

	const addIgnoreRule = useCallback(
		async (pattern: string, subscriptionId: string | null) => {
			if (isTauri()) {
				try {
					await ignoreRulesApi.add(pattern, subscriptionId);
					await refreshIgnoreRules();
					await refreshSubscriptions();
					await notifications.reloadLoaded();
				} catch (err) {
					const classified = classifyError(err);
					toast.error(classified.userMessage, {
						description: "Failed to add ignore rule",
					});
					console.error("[Add ignore rule error]", err);
				}
			}
		},
		[refreshIgnoreRules, refreshSubscriptions, notifications.reloadLoaded],
	);

	const deleteIgnoreRule = useCallback(
		async (id: string) => {
			if (isTauri()) {
				try {
					await ignoreRulesApi.delete(id);
					await refreshIgnoreRules();
					await refreshSubscriptions();
					await notifications.reloadLoaded();
				} catch (err) {
					const classified = classifyError(err);
					toast.error(classified.userMessage, {
						description: "Failed to delete ignore rule",
					});
					console.error("[Delete ignore rule error]", err);
				}
			}
		},
		[refreshIgnoreRules, refreshSubscriptions, notifications.reloadLoaded],
	);

	// Settings actions
	const setTheme = useCallback(async (theme: ThemeMode) => {
		if (isTauri()) {
			try {
				await settingsApi.setTheme(theme);
				setSettings((prev) => ({ ...prev, theme }));
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Failed to save theme preference",
				});
				console.error("[Settings Error]", err);
			}
		} else {
			setSettings((prev) => ({ ...prev, theme }));
		}
	}, []);

	const addServer = useCallback(
		async (
			server: Omit<ServerConfig, "isDefault">,
		): Promise<Subscription[]> => {
			if (isTauri()) {
				const saved = await settingsApi.addServer(server);
				if (saved.warning) toast.warning(saved.warning);
				const loaded = await settingsApi.get();
				setSettings(loaded);
				const added = loaded.servers.find((s) => s.url === saved.url);

				// With a login, bring in the account's topics. The server stays saved
				// if that fails; the sync button retries it.
				if (added && (added.username || added.token)) {
					try {
						const synced = await syncApi.syncSubscriptions(saved.url);
						setSubscriptions(await subscriptionsApi.getAll());
						return synced;
					} catch (err) {
						toast.error("Server added, but syncing its topics failed", {
							description: classifyError(err).userMessage,
						});
					}
				}
				return [];
			}
			const newServer: ServerConfig = { ...server, isDefault: false };
			setSettings((prev) => ({
				...prev,
				servers: [...prev.servers, newServer],
			}));
			return [];
		},
		[],
	);

	const updateServer = useCallback(
		async (server: Omit<ServerConfig, "isDefault">) => {
			if (!isTauri()) return;
			const saved = await settingsApi.updateServer(server);
			if (saved.warning) toast.warning(saved.warning);
			else toast.success("Login updated");
			setSettings(await settingsApi.get());
		},
		[],
	);

	const syncServer = useCallback(async (url: string) => {
		if (!isTauri()) return;
		try {
			const subs = await syncApi.syncSubscriptions(url);
			toast.success(
				`Synced ${subs.length} topic${subs.length === 1 ? "" : "s"}`,
			);
		} catch (err) {
			toast.error(classifyError(err).userMessage, {
				description: "Sync failed",
			});
		}
	}, []);

	const removeServer = useCallback(
		async (url: string) => {
			if (isTauri()) {
				try {
					await settingsApi.removeServer(url);
					// Its topics are gone too (local only; the account keeps them)
					const removed = subscriptionsRef.current.filter(
						(s) => s.serverUrl === url,
					);
					for (const sub of removed) notifications.clearTopic(sub.id);
					const removedIds = new Set(removed.map((s) => s.id));
					setSubscriptions((prev) => prev.filter((s) => s.serverUrl !== url));
					setCurrentTopicId((current) =>
						current && removedIds.has(current) ? null : current,
					);
					// The default may have moved to another server
					setSettings(await settingsApi.get());
					toast.success("Server removed");
				} catch (err) {
					const classified = classifyError(err);
					toast.error(classified.userMessage);
					console.error("[Settings Error]", err);
				}
			} else {
				setSettings((prev) => ({
					...prev,
					servers: prev.servers.filter((s) => s.url !== url),
				}));
			}
		},
		[notifications.clearTopic],
	);

	const setDefaultServer = useCallback(async (url: string) => {
		if (isTauri()) {
			try {
				await settingsApi.setDefaultServer(url);
				setSettings((prev) => ({
					...prev,
					defaultServer: url,
					servers: prev.servers.map((s) => ({
						...s,
						isDefault: s.url === url,
					})),
				}));
				toast.success("Default server updated");
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage);
				console.error("[Settings Error]", err);
			}
		} else {
			setSettings((prev) => ({
				...prev,
				defaultServer: url,
				servers: prev.servers.map((s) => ({ ...s, isDefault: s.url === url })),
			}));
		}
	}, []);

	const setAutostart = useCallback(async (enabled: boolean) => {
		if (isTauri()) {
			try {
				if (enabled) {
					await autostartApi.enable();
				} else {
					await autostartApi.disable();
				}
				setAutostartState(enabled);
				toast.success(`Autostart ${enabled ? "enabled" : "disabled"}`);
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Check system permissions and try again",
				});
				console.error("[Autostart Error]", err);
			}
		}
	}, []);

	// Boolean settings setters - all follow the same pattern via factory
	const {
		setMinimizeToTray,
		setStartMinimized,
		setNotificationForceDisplay,
		setNotificationShowActions,
		setNotificationShowImages,
		setNotificationSound,
		setCompactView,
		setExpandNewMessages,
		setDeleteLocalOnly,
		setFavoritesEnabled,
	} = useMemo(
		() => ({
			setMinimizeToTray: makeBooleanSettingSetter(
				setSettings,
				"minimizeToTray",
				settingsApi.setMinimizeToTray,
				"Minimize to tray",
			),
			setStartMinimized: makeBooleanSettingSetter(
				setSettings,
				"startMinimized",
				settingsApi.setStartMinimized,
				"Start minimized",
			),
			setNotificationForceDisplay: makeBooleanSettingSetter(
				setSettings,
				"notificationForceDisplay",
				settingsApi.setNotificationForceDisplay,
				"Force display",
			),
			setNotificationShowActions: makeBooleanSettingSetter(
				setSettings,
				"notificationShowActions",
				settingsApi.setNotificationShowActions,
				"Show actions",
			),
			setNotificationShowImages: makeBooleanSettingSetter(
				setSettings,
				"notificationShowImages",
				settingsApi.setNotificationShowImages,
				"Show images",
			),
			setNotificationSound: makeBooleanSettingSetter(
				setSettings,
				"notificationSound",
				settingsApi.setNotificationSound,
				"Notification sound",
			),
			setCompactView: makeBooleanSettingSetter(
				setSettings,
				"compactView",
				settingsApi.setCompactView,
				"Compact view",
			),
			setExpandNewMessages: makeBooleanSettingSetter(
				setSettings,
				"expandNewMessages",
				settingsApi.setExpandNewMessages,
				"Expand new messages",
			),
			setDeleteLocalOnly: makeBooleanSettingSetter(
				setSettings,
				"deleteLocalOnly",
				settingsApi.setDeleteLocalOnly,
				"Delete only locally",
			),
			setFavoritesEnabled: makeBooleanSettingSetter(
				setSettings,
				"favoritesEnabled",
				settingsApi.setFavoritesEnabled,
				undefined,
				(enabled) => {
					if (!enabled) setCurrentView("all");
				},
			),
		}),
		[],
	);

	// Notification method uses a different type signature
	const setNotificationMethod = useCallback(
		async (method: NotificationDisplayMethod) => {
			if (!isTauri()) return;
			try {
				await settingsApi.setNotificationMethod(method);
				setSettings((prev) => ({ ...prev, notificationMethod: method }));
				toast.success("Notification method updated");
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage);
				console.error("[Settings Error]", err);
			}
		},
		[],
	);

	const setRetentionMaxAgeDays = useCallback(async (days: number | null) => {
		if (!isTauri()) return;
		try {
			await settingsApi.setRetentionMaxAgeDays(days);
			setSettings((prev) => ({ ...prev, retentionMaxAgeDays: days }));
		} catch (err) {
			const classified = classifyError(err);
			toast.error(classified.userMessage);
			console.error("[Settings Error]", err);
		}
	}, []);

	// Derived data
	const currentNotifications = useMemo(() => {
		if (currentView === "favorites") {
			return notifications.getFavoriteNotifications();
		}
		if (!currentTopicId) {
			// Show all notifications when no topic selected
			return notifications.getAllNotifications();
		}
		return notifications.getForTopic(currentTopicId);
	}, [
		currentView,
		currentTopicId,
		notifications.getForTopic,
		notifications.getAllNotifications,
		notifications.getFavoriteNotifications,
	]);

	const favoritesCount = useMemo(() => {
		let count = 0;
		for (const notifs of notifications.byTopic.values()) {
			for (const n of notifs) {
				if (n.isFavorite) count++;
			}
		}
		return count;
	}, [notifications.byTopic]);

	const subscriptionsWithUnread = useMemo(() => {
		return subscriptions.map((sub) => ({
			...sub,
			unreadCount: notifications.byTopic.has(sub.id)
				? notifications.getUnreadCount(sub.id)
				: sub.unreadCount,
			error: subscriptionErrors[sub.id] ?? null,
		}));
	}, [
		subscriptions,
		notifications.byTopic,
		notifications.getUnreadCount,
		subscriptionErrors,
	]);

	const value = useMemo<AppContextValue>(
		() => ({
			// State
			subscriptions,
			subscriptionsLoading,
			ignoreRules,
			notificationsByTopic: notifications.byTopic,
			currentTopicId,
			currentView,
			settings,
			settingsLoading,
			autostart,
			updateInfo,
			loadError,
			serverStatuses,

			// Actions
			retryLoad: loadData,
			addSubscription,
			removeSubscription,
			toggleMute,
			refreshSubscriptions,
			addIgnoreRule,
			deleteIgnoreRule,
			setCurrentTopicId,
			setCurrentView,
			markAsRead: notifications.markAsRead,
			markAllAsRead: notifications.markAllAsRead,
			markAllAsReadGlobally: notifications.markAllAsReadGlobally,
			deleteNotification: notifications.deleteNotification,
			toggleFavorite: notifications.toggleFavorite,
			setNotificationExpanded: notifications.setExpanded,
			getUnreadCount: notifications.getUnreadCount,
			getTotalUnread: notifications.getTotalUnread,
			setTheme,
			addServer,
			updateServer,
			syncServer,
			removeServer,
			setDefaultServer,
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
			setFavoritesEnabled,
			setUpdateInfo,

			// Derived
			currentNotifications,
			subscriptionsWithUnread,
			favoritesCount,
		}),
		[
			subscriptions,
			subscriptionsLoading,
			ignoreRules,
			notifications.byTopic,
			currentTopicId,
			currentView,
			settings,
			settingsLoading,
			autostart,
			updateInfo,
			loadError,
			serverStatuses,
			loadData,
			addSubscription,
			removeSubscription,
			toggleMute,
			refreshSubscriptions,
			addIgnoreRule,
			deleteIgnoreRule,
			notifications.markAsRead,
			notifications.markAllAsRead,
			notifications.markAllAsReadGlobally,
			notifications.deleteNotification,
			notifications.toggleFavorite,
			notifications.setExpanded,
			notifications.getUnreadCount,
			notifications.getTotalUnread,
			setTheme,
			addServer,
			updateServer,
			syncServer,
			removeServer,
			setDefaultServer,
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
			setFavoritesEnabled,
			currentNotifications,
			subscriptionsWithUnread,
			favoritesCount,
		],
	);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
	const context = useContext(AppContext);
	if (!context) {
		throw new Error("useApp must be used within an AppProvider");
	}
	return context;
}
