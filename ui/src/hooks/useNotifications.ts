import { useCallback, useRef, useState } from "react";
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
	 */
	const markAsRead = useCallback(async (id: string) => {
		if (isTauri()) {
			await notificationsApi.markAsRead(id);
		}
		setByTopic((prev) => {
			const next = new Map(prev);
			for (const [topicId, notifs] of next) {
				const updated = notifs.map((n) =>
					n.id === id ? { ...n, read: true } : n,
				);
				next.set(topicId, updated);
			}
			return next;
		});
	}, []);

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
	 */
	const deleteNotification = useCallback(async (id: string) => {
		if (isTauri()) {
			await notificationsApi.delete(id);
		}
		setByTopic((prev) => {
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
