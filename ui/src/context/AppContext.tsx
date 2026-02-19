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
import { classifyError } from "@/lib/error-classification";
import {
	autostartApi,
	isTauri,
	notificationsApi,
	settingsApi,
	subscriptionsApi,
	syncApi,
} from "@/lib/tauri";
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
}

interface AppActions {
	// Subscriptions
	addSubscription: (subscription: {
		topic: string;
		serverUrl: string;
		displayName?: string;
	}) => Promise<Subscription>;
	removeSubscription: (id: string) => Promise<void>;
	toggleMute: (id: string) => Promise<void>;
	refreshSubscriptions: () => Promise<void>;

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
	const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);
	const [currentView, setCurrentView] = useState<"all" | "favorites">("all");
	const [settings, setSettings] = useState<AppSettings>(mockSettings);
	const [settingsLoading, setSettingsLoading] = useState(true);
	const [autostart, setAutostartState] = useState(false);
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

	// Notification management via custom hook
	const notifications = useNotifications(subscriptions);

	// Load initial data
	useEffect(() => {
		const loadData = async () => {
			try {
				if (isTauri()) {
					// Load all data in parallel to avoid waterfall
					const [subs, loadedSettings, autostartEnabled] = await Promise.all([
						subscriptionsApi.getAll(),
						settingsApi.get(),
						autostartApi.isEnabled(),
					]);

					setSubscriptions(subs);
					setSettings(loadedSettings);
					setAutostartState(autostartEnabled);
				} else {
					// Fallback to mock data
					setSubscriptions(mockSubscriptions);
					setSettings(mockSettings);
				}
			} catch (err) {
				console.error("Failed to load initial data:", err);
				setSubscriptions(mockSubscriptions);
				setSettings(mockSettings);
			} finally {
				setSubscriptionsLoading(false);
				setSettingsLoading(false);
			}
		};
		loadData();
	}, []);

	// Stable key that only changes when subscription IDs change
	const subscriptionIds = useMemo(
		() => subscriptions.map((s) => s.id).join(","),
		[subscriptions],
	);

	// Keep a ref to subscriptions so the effect can read the latest value
	// without depending on the full array
	const subscriptionsRef = useRef(subscriptions);
	subscriptionsRef.current = subscriptions;

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
			console.log("Subscriptions synced, refreshing...");
			const subs = await subscriptionsApi.getAll();
			setSubscriptions(subs);
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
				setSubscriptions((prev) => [...prev, newSub]);
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
		async (id: string) => {
			if (isTauri()) {
				try {
					await subscriptionsApi.remove(id);
					setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
					notifications.clearTopic(id);
					toast.success("Subscription removed");
				} catch (err) {
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
			// Store previous state for rollback
			let previousSubscriptions: Subscription[] = [];
			setSubscriptions((prev) => {
				previousSubscriptions = [...prev];
				// Optimistic update
				return prev.map((sub) =>
					sub.id === id ? { ...sub, muted: !sub.muted } : sub,
				);
			});

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
				await settingsApi.addServer(server);

				// If server has credentials, sync subscriptions
				if (server.username && server.password) {
					const synced = await syncApi.syncSubscriptions(server.url);
					const newServer: ServerConfig = { ...server, isDefault: false };
					setSettings((prev) => ({
						...prev,
						servers: [...prev.servers, newServer],
					}));

					// Also refresh subscriptions to include synced ones
					const subs = await subscriptionsApi.getAll();
					setSubscriptions(subs);

					return synced;
				}
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

	const removeServer = useCallback(async (url: string) => {
		if (isTauri()) {
			try {
				await settingsApi.removeServer(url);
				setSettings((prev) => ({
					...prev,
					servers: prev.servers.filter((s) => s.url !== url),
				}));
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
	}, []);

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
		}));
	}, [subscriptions, notifications.byTopic, notifications.getUnreadCount]);

	const value = useMemo<AppContextValue>(
		() => ({
			// State
			subscriptions,
			subscriptionsLoading,
			notificationsByTopic: notifications.byTopic,
			currentTopicId,
			currentView,
			settings,
			settingsLoading,
			autostart,
			updateInfo,

			// Actions
			addSubscription,
			removeSubscription,
			toggleMute,
			refreshSubscriptions,
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
			notifications.byTopic,
			currentTopicId,
			currentView,
			settings,
			settingsLoading,
			autostart,
			updateInfo,
			addSubscription,
			removeSubscription,
			toggleMute,
			refreshSubscriptions,
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
