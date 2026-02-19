import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { mockNotifications } from "@/data/mock-data";
import { classifyError } from "@/lib/error-classification";
import { isTauri, notificationsApi } from "@/lib/tauri";
import type { Notification, Subscription } from "@/types/ntfy";

/**
 * Manages notification state and operations.
 *
 * Handles loading, caching, and updating notifications for topics.
 * Provides methods for marking as read, deleting, and calculating unread counts.
 */
export function useNotifications(subscriptions: Subscription[]) {
	const [byTopic, setByTopic] = useState<Map<string, Notification[]>>(
		new Map(),
	);
	const loadedTopicsRef = useRef<Set<string>>(new Set());
	// Reverse index: notificationId → topicId for O(1) lookup
	const notificationIndexRef = useRef<Map<string, string>>(new Map());

	/**
	 * Loads notifications for a topic if not already loaded.
	 */
	const loadForTopic = useCallback(async (topicId: string) => {
		if (loadedTopicsRef.current.has(topicId)) return;

		loadedTopicsRef.current.add(topicId);

		try {
			let notifs: Notification[];
			if (isTauri()) {
				notifs = await notificationsApi.getBySubscription(topicId);
			} else {
				notifs = mockNotifications.filter((n) => n.topicId === topicId);
			}
			for (const n of notifs) {
				notificationIndexRef.current.set(n.id, topicId);
			}
			setByTopic((prev) => new Map(prev).set(topicId, notifs));
		} catch (err) {
			console.error("Failed to load notifications:", err);
			const filtered = mockNotifications.filter((n) => n.topicId === topicId);
			for (const n of filtered) {
				notificationIndexRef.current.set(n.id, topicId);
			}
			setByTopic((prev) => new Map(prev).set(topicId, filtered));
			loadedTopicsRef.current.delete(topicId);
		}
	}, []);

	/**
	 * Adds a new notification to the beginning of its topic's list.
	 */
	const addNotification = useCallback((notification: Notification) => {
		notificationIndexRef.current.set(notification.id, notification.topicId);
		setByTopic((prev) => {
			const existing = prev.get(notification.topicId) || [];
			return new Map(prev).set(notification.topicId, [
				notification,
				...existing,
			]);
		});
	}, []);

	/**
	 * Marks a notification as read.
	 * Uses optimistic UI update for instant feedback with rollback on error.
	 */
	const markAsRead = useCallback((id: string) => {
		// Store previous state for rollback
		let previousState: Map<string, Notification[]> | null = null;
		const topicId = notificationIndexRef.current.get(id);

		// Optimistic update - instant UI feedback
		setByTopic((prev) => {
			previousState = new Map(prev);
			if (!topicId) return prev;

			const notifs = prev.get(topicId);
			if (!notifs) return prev;

			const updated = notifs.map((n) =>
				n.id === id ? { ...n, read: true } : n,
			);
			return new Map(prev).set(topicId, updated);
		});

		// API call in background
		if (isTauri()) {
			notificationsApi.markAsRead(id).catch((err) => {
				// Rollback on error
				if (previousState) {
					setByTopic(previousState);
				}
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Failed to mark notification as read",
				});
				console.error("[Mark as read error]", err);
			});
		}
	}, []);

	/**
	 * Marks all notifications in a topic as read.
	 * Uses optimistic UI update for instant feedback with rollback on error.
	 */
	const markAllAsRead = useCallback((subscriptionId: string) => {
		// Store previous state for rollback
		let previousState: Map<string, Notification[]> | null = null;

		// Optimistic update - instant UI feedback
		setByTopic((prev) => {
			previousState = new Map(prev);
			const notifs = prev.get(subscriptionId);
			if (!notifs) return prev;
			const updated = notifs.map((n) => ({ ...n, read: true }));
			return new Map(prev).set(subscriptionId, updated);
		});

		// API call in background
		if (isTauri()) {
			notificationsApi.markAllAsRead(subscriptionId).catch((err) => {
				// Rollback on error
				if (previousState) {
					setByTopic(previousState);
				}
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Failed to mark all notifications as read",
				});
				console.error("[Mark all as read error]", err);
			});
		}
	}, []);

	/**
	 * Marks all notifications across all topics as read.
	 * Uses optimistic UI update for instant feedback with rollback on error.
	 */
	const markAllAsReadGlobally = useCallback(() => {
		// Store previous state for rollback
		let previousState: Map<string, Notification[]> | null = null;

		// Optimistic update - mark all as read in UI
		setByTopic((prev) => {
			previousState = new Map(prev);
			const updated = new Map<string, Notification[]>();
			for (const [topicId, notifs] of prev) {
				updated.set(
					topicId,
					notifs.map((n) => ({ ...n, read: true })),
				);
			}
			return updated;
		});

		// API calls in background for each subscription
		if (isTauri()) {
			const topicIds = Array.from(byTopic.keys());
			let hasError = false;

			Promise.all(
				topicIds.map((topicId) =>
					notificationsApi.markAllAsRead(topicId).catch((err) => {
						hasError = true;
						console.error(`Failed to mark all as read for ${topicId}:`, err);
						return err;
					}),
				),
			).then(() => {
				if (hasError && previousState) {
					// Rollback on error
					setByTopic(previousState);
					toast.error("Failed to mark all notifications as read", {
						description: "Please try again",
					});
				}
			});
		}
	}, [byTopic]);

	/**
	 * Deletes a notification.
	 * Uses optimistic UI update for instant feedback with rollback on error.
	 */
	const deleteNotification = useCallback((id: string) => {
		// Store previous state for rollback
		let previousState: Map<string, Notification[]> | null = null;
		const topicId = notificationIndexRef.current.get(id);

		// Optimistic update - instant UI feedback
		setByTopic((prev) => {
			previousState = new Map(prev);
			if (!topicId) return prev;

			const notifs = prev.get(topicId);
			if (!notifs) return prev;

			const filtered = notifs.filter((n) => n.id !== id);
			return new Map(prev).set(topicId, filtered);
		});

		notificationIndexRef.current.delete(id);

		// API call in background
		if (isTauri()) {
			notificationsApi.delete(id).catch((err) => {
				// Rollback on error
				if (previousState) {
					setByTopic(previousState);
				}
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Failed to delete notification",
				});
				console.error("[Delete notification error]", err);
			});
		}
	}, []);

	/**
	 * Toggles the favorite state of a notification.
	 * Uses optimistic UI update for instant feedback with rollback on error.
	 */
	const toggleFavorite = useCallback((id: string) => {
		let previousState: Map<string, Notification[]> | null = null;
		const topicId = notificationIndexRef.current.get(id);
		let newFavorite = false;

		setByTopic((prev) => {
			previousState = new Map(prev);
			if (!topicId) return prev;

			const notifs = prev.get(topicId);
			if (!notifs) return prev;

			const updated = notifs.map((n) => {
				if (n.id === id) {
					newFavorite = !n.isFavorite;
					return { ...n, isFavorite: newFavorite };
				}
				return n;
			});
			return new Map(prev).set(topicId, updated);
		});

		if (isTauri()) {
			notificationsApi.setFavorite(id, newFavorite).catch((err) => {
				if (previousState) {
					setByTopic(previousState);
				}
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Failed to update favorite",
				});
				console.error("[Toggle favorite error]", err);
			});
		}
	}, []);

	/**
	 * Sets the expanded state for a notification.
	 * Uses optimistic UI update for instant feedback.
	 */
	const setExpanded = useCallback((id: string, expanded: boolean) => {
		const topicId = notificationIndexRef.current.get(id);
		// Optimistic update - instant UI feedback
		setByTopic((prev) => {
			if (!topicId) return prev;

			const notifs = prev.get(topicId);
			if (!notifs) return prev;

			const updated = notifs.map((n) =>
				n.id === id ? { ...n, isExpanded: expanded } : n,
			);
			return new Map(prev).set(topicId, updated);
		});
	}, []);

	/**
	 * Clears cached notifications for a topic (used when unsubscribing).
	 */
	const clearTopic = useCallback((topicId: string) => {
		setByTopic((prev) => {
			const notifs = prev.get(topicId);
			if (notifs) {
				for (const n of notifs) {
					notificationIndexRef.current.delete(n.id);
				}
			}
			const next = new Map(prev);
			next.delete(topicId);
			return next;
		});
		loadedTopicsRef.current.delete(topicId);
	}, []);

	/**
	 * Returns the unread count for a topic.
	 */
	const getUnreadCount = useCallback(
		(subscriptionId: string) => {
			const notifs = byTopic.get(subscriptionId);
			if (!notifs) return 0;
			let count = 0;
			for (const n of notifs) {
				if (!n.read) count++;
			}
			return count;
		},
		[byTopic],
	);

	/**
	 * Returns total unread count across all non-muted subscriptions.
	 */
	const getTotalUnread = useCallback(() => {
		let total = 0;
		for (const sub of subscriptions) {
			if (!sub.muted) {
				const notifs = byTopic.get(sub.id);
				if (notifs) {
					for (const n of notifs) {
						if (!n.read) total++;
					}
				}
			}
		}
		return total;
	}, [subscriptions, byTopic]);

	/**
	 * Returns sorted notifications for a topic.
	 */
	const getForTopic = useCallback(
		(topicId: string) => {
			const notifs = byTopic.get(topicId) || [];
			return [...notifs].sort(
				(a: Notification, b: Notification) => b.timestamp - a.timestamp,
			);
		},
		[byTopic],
	);

	/**
	 * Loads notifications for all subscriptions.
	 */
	const loadAllTopics = useCallback(
		async (subs: Subscription[]) => {
			const promises = subs.map((sub) => loadForTopic(sub.id));
			await Promise.all(promises);
		},
		[loadForTopic],
	);

	/**
	 * Returns all notifications from all topics, sorted by timestamp.
	 */
	const getAllNotifications = useCallback(() => {
		const all: Notification[] = [];
		for (const notifs of byTopic.values()) {
			all.push(...notifs);
		}
		return all.sort(
			(a: Notification, b: Notification) => b.timestamp - a.timestamp,
		);
	}, [byTopic]);

	/**
	 * Returns all favorite notifications from all topics, sorted by timestamp.
	 */
	const getFavoriteNotifications = useCallback(() => {
		const all: Notification[] = [];
		for (const notifs of byTopic.values()) {
			for (const n of notifs) {
				if (n.isFavorite) all.push(n);
			}
		}
		return all.sort(
			(a: Notification, b: Notification) => b.timestamp - a.timestamp,
		);
	}, [byTopic]);

	return {
		byTopic,
		loadForTopic,
		loadAllTopics,
		addNotification,
		markAsRead,
		markAllAsRead,
		markAllAsReadGlobally,
		deleteNotification,
		toggleFavorite,
		setExpanded,
		clearTopic,
		getUnreadCount,
		getTotalUnread,
		getForTopic,
		getAllNotifications,
		getFavoriteNotifications,
	};
}
