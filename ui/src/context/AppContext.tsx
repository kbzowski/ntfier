import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { mockSettings, mockSubscriptions } from "@/data/mock-data";
import { useNotifications, useTauriEvent } from "@/hooks";
import {
	autostartApi,
	isTauri,
	settingsApi,
	subscriptionsApi,
	syncApi,
} from "@/lib/tauri";
import type {
	AppSettings,
	Notification,
	ServerConfig,
	Subscription,
	ThemeMode,
} from "@/types/ntfy";

interface AppState {
	// Subscriptions
	subscriptions: Subscription[];
	subscriptionsLoading: boolean;

	// Notifications (keyed by subscription ID)
	notificationsByTopic: Map<string, Notification[]>;
	currentTopicId: string | null;

	// Settings
	settings: AppSettings;
	settingsLoading: boolean;
	autostart: boolean;
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

	// Notifications
	markAsRead: (id: string) => Promise<void>;
	markAllAsRead: (subscriptionId: string) => Promise<void>;
	deleteNotification: (id: string) => Promise<void>;
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
}

interface AppContextValue extends AppState, AppActions {
	// Derived data
	currentNotifications: Notification[];
	subscriptionsWithUnread: Subscription[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
	// State
	const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
	const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
	const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);
	const [settings, setSettings] = useState<AppSettings>(mockSettings);
	const [settingsLoading, setSettingsLoading] = useState(true);
	const [autostart, setAutostartState] = useState(false);

	// Notification management via custom hook
	const notifications = useNotifications(subscriptions);

	// Load initial data
	useEffect(() => {
		const loadData = async () => {
			try {
				if (isTauri()) {
					// Load subscriptions
					const subs = await subscriptionsApi.getAll();
					setSubscriptions(subs);

					// Load settings
					const loadedSettings = await settingsApi.get();
					setSettings(loadedSettings);

					// Load autostart state
					const autostartEnabled = await autostartApi.isEnabled();
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

	// Load notifications when topic changes
	useEffect(() => {
		if (currentTopicId) {
			notifications.loadForTopic(currentTopicId);
		} else if (subscriptions.length > 0) {
			// Load all notifications for the "All" view
			notifications.loadAllTopics(subscriptions);
		}
	}, [
		currentTopicId,
		subscriptions,
		notifications.loadForTopic,
		notifications.loadAllTopics,
	]);

	// Listen for new notifications from backend
	useTauriEvent<Notification>(
		"notification:new",
		notifications.addNotification,
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
				unreadCount: 0,
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
				await subscriptionsApi.remove(id);
			}
			setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
			notifications.clearTopic(id);
		},
		[notifications.clearTopic],
	);

	const toggleMute = useCallback(async (id: string) => {
		if (isTauri()) {
			const updated = await subscriptionsApi.toggleMute(id);
			setSubscriptions((prev) =>
				prev.map((sub) => (sub.id === id ? updated : sub)),
			);
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
			await settingsApi.setTheme(theme);
		}
		setSettings((prev) => ({ ...prev, theme }));
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
			await settingsApi.removeServer(url);
		}
		setSettings((prev) => ({
			...prev,
			servers: prev.servers.filter((s) => s.url !== url),
		}));
	}, []);

	const setDefaultServer = useCallback(async (url: string) => {
		if (isTauri()) {
			await settingsApi.setDefaultServer(url);
		}
		setSettings((prev) => ({
			...prev,
			defaultServer: url,
			servers: prev.servers.map((s) => ({ ...s, isDefault: s.url === url })),
		}));
	}, []);

	const setAutostart = useCallback(async (enabled: boolean) => {
		if (isTauri()) {
			if (enabled) {
				await autostartApi.enable();
			} else {
				await autostartApi.disable();
			}
			setAutostartState(enabled);
		}
	}, []);

	const setMinimizeToTray = useCallback(async (enabled: boolean) => {
		if (isTauri()) {
			await settingsApi.setMinimizeToTray(enabled);
			setSettings((prev) => ({ ...prev, minimizeToTray: enabled }));
		}
	}, []);

	const setStartMinimized = useCallback(async (enabled: boolean) => {
		if (isTauri()) {
			await settingsApi.setStartMinimized(enabled);
			setSettings((prev) => ({ ...prev, startMinimized: enabled }));
		}
	}, []);

	// Derived data
	const currentNotifications = useMemo(() => {
		if (!currentTopicId) {
			// Show all notifications when no topic selected
			return notifications.getAllNotifications();
		}
		return notifications.getForTopic(currentTopicId);
	}, [
		currentTopicId,
		notifications.getForTopic,
		notifications.getAllNotifications,
	]);

	const subscriptionsWithUnread = useMemo(() => {
		return subscriptions.map((sub) => ({
			...sub,
			unreadCount: notifications.byTopic.has(sub.id)
				? notifications.getUnreadCount(sub.id)
				: sub.unreadCount,
		}));
	}, [subscriptions, notifications.byTopic, notifications.getUnreadCount]);

	const value: AppContextValue = {
		// State
		subscriptions,
		subscriptionsLoading,
		notificationsByTopic: notifications.byTopic,
		currentTopicId,
		settings,
		settingsLoading,
		autostart,

		// Actions
		addSubscription,
		removeSubscription,
		toggleMute,
		refreshSubscriptions,
		setCurrentTopicId,
		markAsRead: notifications.markAsRead,
		markAllAsRead: notifications.markAllAsRead,
		deleteNotification: notifications.deleteNotification,
		getUnreadCount: notifications.getUnreadCount,
		getTotalUnread: notifications.getTotalUnread,
		setTheme,
		addServer,
		removeServer,
		setDefaultServer,
		setAutostart,
		setMinimizeToTray,
		setStartMinimized,

		// Derived
		currentNotifications,
		subscriptionsWithUnread,
	};

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
	const context = useContext(AppContext);
	if (!context) {
		throw new Error("useApp must be used within an AppProvider");
	}
	return context;
}
