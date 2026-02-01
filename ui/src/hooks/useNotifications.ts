import { useCallback, useRef, useState } from "react";
import { mockNotifications } from "@/data/mock-data";
import { isTauri, notificationsApi } from "@/lib/tauri";
import type { Notification, Subscription } from "@/types/ntfy";

/**
 * Finds the topic ID for a notification by searching through all topics.
 */
function findTopicForNotification(
	byTopic: Map<string, Notification[]>,
	notificationId: string,
): string | undefined {
	for (const [topicId, notifs] of byTopic) {
		if (notifs.some((n) => n.id === notificationId)) {
			return topicId;
		}
	}
	return undefined;
}

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
			setByTopic((prev) => new Map(prev).set(topicId, notifs));
		} catch (err) {
			console.error("Failed to load notifications:", err);
			const filtered = mockNotifications.filter((n) => n.topicId === topicId);
			setByTopic((prev) => new Map(prev).set(topicId, filtered));
			loadedTopicsRef.current.delete(topicId);
		}
	}, []);

	/**
	 * Adds a new notification to the beginning of its topic's list.
	 */
	const addNotification = useCallback((notification: Notification) => {
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
	 * Uses optimistic UI update for instant feedback.
	 */
	const markAsRead = useCallback((id: string) => {
		// Optimistic update - instant UI feedback
		setByTopic((prev) => {
			const topicId = findTopicForNotification(prev, id);
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
				console.error("Failed to mark as read:", err);
			});
		}
	}, []);

	/**
	 * Marks all notifications in a topic as read.
	 * Uses optimistic UI update for instant feedback.
	 */
	const markAllAsRead = useCallback((subscriptionId: string) => {
		// Optimistic update - instant UI feedback
		setByTopic((prev) => {
			const notifs = prev.get(subscriptionId);
			if (!notifs) return prev;
			const updated = notifs.map((n) => ({ ...n, read: true }));
			return new Map(prev).set(subscriptionId, updated);
		});

		// API call in background
		if (isTauri()) {
			notificationsApi.markAllAsRead(subscriptionId).catch((err) => {
				console.error("Failed to mark all as read:", err);
			});
		}
	}, []);

	/**
	 * Marks all notifications across all topics as read.
	 * Uses optimistic UI update for instant feedback.
	 */
	const markAllAsReadGlobally = useCallback(() => {
		// Optimistic update - mark all as read in UI
		setByTopic((prev) => {
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
			for (const topicId of topicIds) {
				notificationsApi.markAllAsRead(topicId).catch((err) => {
					console.error(`Failed to mark all as read for ${topicId}:`, err);
				});
			}
		}
	}, [byTopic]);

	/**
	 * Deletes a notification.
	 * Uses optimistic UI update for instant feedback.
	 */
	const deleteNotification = useCallback((id: string) => {
		// Optimistic update - instant UI feedback
		setByTopic((prev) => {
			const topicId = findTopicForNotification(prev, id);
			if (!topicId) return prev;

			const notifs = prev.get(topicId);
			if (!notifs) return prev;

			const filtered = notifs.filter((n) => n.id !== id);
			return new Map(prev).set(topicId, filtered);
		});

		// API call in background
		if (isTauri()) {
			notificationsApi.delete(id).catch((err) => {
				console.error("Failed to delete notification:", err);
			});
		}
	}, []);

	/**
	 * Sets the expanded state for a notification.
	 * Uses optimistic UI update for instant feedback.
	 */
	const setExpanded = useCallback((id: string, expanded: boolean) => {
		// Optimistic update - instant UI feedback
		setByTopic((prev) => {
			const topicId = findTopicForNotification(prev, id);
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
			const notifs = byTopic.get(subscriptionId) || [];
			return notifs.filter((n) => !n.read).length;
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
				const notifs = byTopic.get(sub.id) || [];
				total += notifs.filter((n) => !n.read).length;
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
			return [...notifs].sort((a, b) => b.timestamp - a.timestamp);
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
		return all.sort((a, b) => b.timestamp - a.timestamp);
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
		setExpanded,
		clearTopic,
		getUnreadCount,
		getTotalUnread,
		getForTopic,
		getAllNotifications,
	};
}
