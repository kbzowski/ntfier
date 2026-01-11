import { useCallback, useMemo, useRef, useState } from "react";
import { mockNotifications } from "@/data/mock-data";
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

	// Reverse lookup: notificationId -> topicId for O(1) access
	const notificationToTopic = useMemo(() => {
		const map = new Map<string, string>();
		for (const [topicId, notifs] of byTopic) {
			for (const n of notifs) {
				map.set(n.id, topicId);
			}
		}
		return map;
	}, [byTopic]);

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
	 * Uses reverse lookup for O(1) topic identification.
	 */
	const markAsRead = useCallback(
		async (id: string) => {
			if (isTauri()) {
				await notificationsApi.markAsRead(id);
			}

			const topicId = notificationToTopic.get(id);
			if (!topicId) return;

			setByTopic((prev) => {
				const notifs = prev.get(topicId);
				if (!notifs) return prev;

				const updated = notifs.map((n) =>
					n.id === id ? { ...n, read: true } : n,
				);
				return new Map(prev).set(topicId, updated);
			});
		},
		[notificationToTopic],
	);

	/**
	 * Marks all notifications in a topic as read.
	 */
	const markAllAsRead = useCallback(async (subscriptionId: string) => {
		if (isTauri()) {
			await notificationsApi.markAllAsRead(subscriptionId);
		}
		setByTopic((prev) => {
			const notifs = prev.get(subscriptionId);
			if (!notifs) return prev;
			const updated = notifs.map((n) => ({ ...n, read: true }));
			return new Map(prev).set(subscriptionId, updated);
		});
	}, []);

	/**
	 * Deletes a notification.
	 * Uses reverse lookup for O(1) topic identification.
	 */
	const deleteNotification = useCallback(
		async (id: string) => {
			if (isTauri()) {
				await notificationsApi.delete(id);
			}

			const topicId = notificationToTopic.get(id);
			if (!topicId) return;

			setByTopic((prev) => {
				const notifs = prev.get(topicId);
				if (!notifs) return prev;

				const filtered = notifs.filter((n) => n.id !== id);
				return new Map(prev).set(topicId, filtered);
			});
		},
		[notificationToTopic],
	);

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

	return {
		byTopic,
		loadForTopic,
		addNotification,
		markAsRead,
		markAllAsRead,
		deleteNotification,
		clearTopic,
		getUnreadCount,
		getTotalUnread,
		getForTopic,
	};
}
