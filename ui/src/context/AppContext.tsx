import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { events, isTauri, notificationsApi, settingsApi, subscriptionsApi, syncApi, autostartApi } from "@/lib/tauri";
import { mockNotifications, mockSettings, mockSubscriptions } from "@/data/mock-data";
import type { AppSettings, Notification, ServerConfig, Subscription, ThemeMode } from "@/types/ntfy";

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
	addSubscription: (subscription: { topic: string; serverUrl: string; displayName?: string }) => Promise<Subscription>;
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
	addServer: (server: Omit<ServerConfig, "isDefault">) => Promise<Subscription[]>;
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
	const [notificationsByTopic, setNotificationsByTopic] = useState<Map<string, Notification[]>>(new Map());
	const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);
	const [settings, setSettings] = useState<AppSettings>(mockSettings);
	const [settingsLoading, setSettingsLoading] = useState(true);
	const [autostart, setAutostartState] = useState(false);

	// Ref to track loaded topics (avoids having Map in useEffect dependencies)
	const loadedTopicsRef = useRef<Set<string>>(new Set());

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
		if (!currentTopicId) return;

		// Check if we already loaded this topic using ref (avoids Map in dependencies)
		if (loadedTopicsRef.current.has(currentTopicId)) return;

		// Mark as loading immediately to prevent duplicate requests
		loadedTopicsRef.current.add(currentTopicId);

		const loadNotifications = async () => {
			try {
				let notifs: Notification[];
				if (isTauri()) {
					notifs = await notificationsApi.getBySubscription(currentTopicId);
				} else {
					notifs = mockNotifications.filter((n) => n.topicId === currentTopicId);
				}
				setNotificationsByTopic((prev) => new Map(prev).set(currentTopicId, notifs));
			} catch (err) {
				console.error("Failed to load notifications:", err);
				const filtered = mockNotifications.filter((n) => n.topicId === currentTopicId);
				setNotificationsByTopic((prev) => new Map(prev).set(currentTopicId, filtered));
				// Remove from loaded on error to allow retry
				loadedTopicsRef.current.delete(currentTopicId);
			}
		};
		loadNotifications();
	}, [currentTopicId]);

	// Listen for new notifications
	useEffect(() => {
		if (!isTauri()) return;

		let cancelled = false;
		let unlisten: (() => void) | undefined;

		(async () => {
			try {
				const unlistenFn = await events.onNewNotification((notification) => {
					setNotificationsByTopic((prev) => {
						const existing = prev.get(notification.topicId) || [];
						return new Map(prev).set(notification.topicId, [notification, ...existing]);
					});
				});

				if (cancelled) {
					// Component unmounted while waiting - cleanup immediately
					unlistenFn();
				} else {
					unlisten = unlistenFn;
				}
			} catch (err) {
				console.error("Failed to register notification listener:", err);
			}
		})();

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, []);

	// Listen for subscriptions sync completion (backend syncs on startup)
	useEffect(() => {
		if (!isTauri()) return;

		let cancelled = false;
		let unlisten: (() => void) | undefined;

		(async () => {
			try {
				const unlistenFn = await events.onSubscriptionsSynced(async () => {
					console.log("Subscriptions synced, refreshing...");
					const subs = await subscriptionsApi.getAll();
					setSubscriptions(subs);
				});

				if (cancelled) {
					unlistenFn();
				} else {
					unlisten = unlistenFn;
				}
			} catch (err) {
				console.error("Failed to register sync listener:", err);
			}
		})();

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, []);

	// Listen for navigate:subscription event (from tray icon click)
	useEffect(() => {
		if (!isTauri()) return;

		let cancelled = false;
		let unlisten: (() => void) | undefined;

		(async () => {
			try {
				const unlistenFn = await events.onNavigateSubscription((subscriptionId) => {
					console.log("Navigating to subscription:", subscriptionId);
					setCurrentTopicId(subscriptionId);
				});

				if (cancelled) {
					unlistenFn();
				} else {
					unlisten = unlistenFn;
				}
			} catch (err) {
				console.error("Failed to register navigate listener:", err);
			}
		})();

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, []);

	// Subscription actions
	const addSubscription = useCallback(async (subscription: { topic: string; serverUrl: string; displayName?: string }) => {
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
	}, []);

	const removeSubscription = useCallback(async (id: string) => {
		if (isTauri()) {
			await subscriptionsApi.remove(id);
		}
		setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
		setNotificationsByTopic((prev) => {
			const next = new Map(prev);
			next.delete(id);
			return next;
		});
		// Clean up the loaded topics ref so topic can be reloaded if re-subscribed
		loadedTopicsRef.current.delete(id);
	}, []);

	const toggleMute = useCallback(async (id: string) => {
		if (isTauri()) {
			const updated = await subscriptionsApi.toggleMute(id);
			setSubscriptions((prev) => prev.map((sub) => (sub.id === id ? updated : sub)));
		} else {
			setSubscriptions((prev) => prev.map((sub) => (sub.id === id ? { ...sub, muted: !sub.muted } : sub)));
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

	// Notification actions
	const markAsRead = useCallback(async (id: string) => {
		if (isTauri()) {
			await notificationsApi.markAsRead(id);
		}
		setNotificationsByTopic((prev) => {
			const next = new Map(prev);
			for (const [topicId, notifs] of next) {
				const updated = notifs.map((n) => (n.id === id ? { ...n, read: true } : n));
				next.set(topicId, updated);
			}
			return next;
		});
	}, []);

	const markAllAsRead = useCallback(async (subscriptionId: string) => {
		if (isTauri()) {
			await notificationsApi.markAllAsRead(subscriptionId);
		}
		setNotificationsByTopic((prev) => {
			const notifs = prev.get(subscriptionId);
			if (!notifs) return prev;
			const updated = notifs.map((n) => ({ ...n, read: true }));
			return new Map(prev).set(subscriptionId, updated);
		});
	}, []);

	const deleteNotification = useCallback(async (id: string) => {
		if (isTauri()) {
			await notificationsApi.delete(id);
		}
		setNotificationsByTopic((prev) => {
			const next = new Map(prev);
			for (const [topicId, notifs] of next) {
				const filtered = notifs.filter((n) => n.id !== id);
				if (filtered.length !== notifs.length) {
					next.set(topicId, filtered);
				}
			}
			return next;
		});
	}, []);

	const getUnreadCount = useCallback((subscriptionId: string) => {
		const notifs = notificationsByTopic.get(subscriptionId) || [];
		return notifs.filter((n) => !n.read).length;
	}, [notificationsByTopic]);

	const getTotalUnread = useCallback(() => {
		let total = 0;
		for (const sub of subscriptions) {
			if (!sub.muted) {
				const notifs = notificationsByTopic.get(sub.id) || [];
				total += notifs.filter((n) => !n.read).length;
			}
		}
		return total;
	}, [subscriptions, notificationsByTopic]);

	// Settings actions
	const setTheme = useCallback(async (theme: ThemeMode) => {
		if (isTauri()) {
			await settingsApi.setTheme(theme);
		}
		setSettings((prev) => ({ ...prev, theme }));
	}, []);

	const addServer = useCallback(async (server: Omit<ServerConfig, "isDefault">): Promise<Subscription[]> => {
		if (isTauri()) {
			await settingsApi.addServer(server);

			// If server has credentials, sync subscriptions
			if (server.username && server.password) {
				const synced = await syncApi.syncSubscriptions(server.url);
				const newServer: ServerConfig = { ...server, isDefault: false };
				setSettings((prev) => ({ ...prev, servers: [...prev.servers, newServer] }));

				// Also refresh subscriptions to include synced ones
				const subs = await subscriptionsApi.getAll();
				setSubscriptions(subs);

				return synced;
			}
		}
		const newServer: ServerConfig = { ...server, isDefault: false };
		setSettings((prev) => ({ ...prev, servers: [...prev.servers, newServer] }));
		return [];
	}, []);

	const removeServer = useCallback(async (url: string) => {
		if (isTauri()) {
			await settingsApi.removeServer(url);
		}
		setSettings((prev) => ({ ...prev, servers: prev.servers.filter((s) => s.url !== url) }));
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
		if (!currentTopicId) return [];
		const notifs = notificationsByTopic.get(currentTopicId) || [];
		return [...notifs].sort((a, b) => b.timestamp - a.timestamp);
	}, [currentTopicId, notificationsByTopic]);

	const subscriptionsWithUnread = useMemo(() => {
		return subscriptions.map((sub) => ({
			...sub,
			unreadCount: notificationsByTopic.has(sub.id)
				? getUnreadCount(sub.id)
				: sub.unreadCount,
		}));
	}, [subscriptions, notificationsByTopic, getUnreadCount]);

	const value: AppContextValue = {
		// State
		subscriptions,
		subscriptionsLoading,
		notificationsByTopic,
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
		markAsRead,
		markAllAsRead,
		deleteNotification,
		getUnreadCount,
		getTotalUnread,
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
