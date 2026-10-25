import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { mockSubscriptions } from "@/data/mock-data";
import { useNotifications } from "@/hooks/useNotifications";
import { type SettingsState, useSettings } from "@/hooks/useSettings";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { BackendError, classifyError } from "@/lib/error-classification";
import { applyServerRemoved } from "@/lib/serverTopics";
import { isTauri, notificationsApi, subscriptionsApi } from "@/lib/tauri";

/** Payload of the backend's `subscription:error` event. */
type SubscriptionError = { id: string; message: string | null };

import type { Notification, Subscription } from "@/types/ntfy";

interface AppState {
	// Subscriptions
	subscriptions: Subscription[];
	subscriptionsLoading: boolean;

	// Notifications (keyed by subscription ID)
	notificationsByTopic: Map<string, Notification[]>;
	currentTopicId: string | null;
	currentView: "all" | "favorites";

	// Startup load failure, shown instead of the list
	loadError: string | null;
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
}

interface AppContextValue extends AppState, AppActions, SettingsState {
	// Derived data
	currentNotifications: Notification[];
	subscriptionsWithUnread: Subscription[];
	favoritesCount: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
	// State
	const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
	const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
	const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);
	const [currentView, setCurrentView] = useState<"all" | "favorites">("all");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [subscriptionErrors, setSubscriptionErrors] = useState<
		Record<string, string>
	>({});

	// Notification management via custom hook
	const notifications = useNotifications(subscriptions);

	const settingsState = useSettings({
		onIgnoreRulesChanged: async () => {
			await refreshSubscriptions();
			await notifications.reloadLoaded();
		},
		onServerRemoved: (url) => {
			// Its topics are gone too (local only; the account keeps them)
			const next = applyServerRemoved(
				subscriptionsRef.current,
				currentTopicId,
				url,
			);
			for (const id of next.removedIds) notifications.clearTopic(id);
			setSubscriptions(next.subscriptions);
			setCurrentTopicId(next.currentTopicId);
		},
	});
	const { settings, settingsLoadError, reloadSettings } = settingsState;

	// Also when favorites are turned off in the settings window
	useEffect(() => {
		if (!settings.favoritesEnabled) setCurrentView("all");
	}, [settings.favoritesEnabled]);

	// Load initial data
	const loadData = useCallback(async () => {
		setLoadError(null);
		try {
			if (isTauri()) {
				setSubscriptions(await subscriptionsApi.getAll());
			} else {
				setSubscriptions(mockSubscriptions);
			}
		} catch (err) {
			console.error("Failed to load initial data:", err);
			setLoadError(classifyError(err).userMessage);
		} finally {
			setSubscriptionsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const retryLoad = useCallback(async () => {
		await Promise.all([loadData(), reloadSettings()]);
	}, [loadData, reloadSettings]);

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
		"notifications:retention-applied",
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
			...settingsState,

			// State
			subscriptions,
			subscriptionsLoading,
			notificationsByTopic: notifications.byTopic,
			currentTopicId,
			currentView,
			loadError: loadError ?? settingsLoadError,

			// Actions
			retryLoad,
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

			// Derived
			currentNotifications,
			subscriptionsWithUnread,
			favoritesCount,
		}),
		[
			settingsState,
			subscriptions,
			subscriptionsLoading,
			notifications.byTopic,
			currentTopicId,
			currentView,
			loadError,
			settingsLoadError,
			retryLoad,
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
