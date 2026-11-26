/**
 * @module lib/tauri
 *
 * Tauri backend API bindings.
 *
 * Provides typed wrappers around generated bindings that turn backend errors
 * into `BackendError`. Falls back gracefully when not running in Tauri.
 */

import { isTauri as isTauriCore } from "@tauri-apps/api/core";
import {
	disable as autostartDisable,
	enable as autostartEnable,
	isEnabled as autostartIsEnabled,
} from "@tauri-apps/plugin-autostart";

import { commands } from "@/types/bindings";
import type {
	AppError,
	AppSettings,
	CreateSubscription,
	IgnoreRule,
	Notification,
	NotificationDisplayMethod,
	ServerConfig,
	Subscription,
	UpdateInfo,
} from "@/types/ntfy";
import { BackendError } from "./error-classification";

// Re-export types for consumers
export type {
	AppError,
	AppSettings,
	CreateSubscription,
	IgnoreRule,
	Notification,
	NotificationDisplayMethod,
	ServerConfig,
	Subscription,
	UpdateInfo,
};

// ===== Error Handling =====

/**
 * Extracts a human-readable message from an AppError discriminated union.
 *
 * AppError from Rust is serialized as: { Database: "message" } | { Connection: "message" } | ...
 */
export function getErrorMessage(error: unknown): string {
	// Handle standard Error objects
	if (error instanceof Error) {
		return error.message;
	}

	// Handle string errors
	if (typeof error === "string") {
		return error;
	}

	// Handle AppError discriminated union: { VariantName: "message" }
	if (error && typeof error === "object") {
		const appError = error as AppError;
		// Extract the first (and only) key's value
		const keys = Object.keys(appError) as (keyof AppError)[];
		if (keys.length === 1) {
			const key = keys[0];
			const value = (appError as Record<string, unknown>)[key];
			if (typeof value === "string") {
				return value;
			}
		}
	}

	return "An unknown error occurred";
}

/**
 * Awaits a generated command, rethrowing the `AppError` it rejects with as a `BackendError`.
 */
async function call<T>(command: Promise<T>): Promise<T> {
	try {
		return await command;
	} catch (error) {
		if (error instanceof Error) throw error;
		const kind =
			error && typeof error === "object" ? (Object.keys(error)[0] ?? "") : "";
		throw new BackendError(getErrorMessage(error), kind);
	}
}

// ===== Subscriptions API =====

export const subscriptionsApi = {
	getAll: () => call(commands.getSubscriptions()),

	add: (subscription: {
		topic: string;
		serverUrl: string;
		displayName?: string;
	}) =>
		call(
			commands.addSubscription({
				topic: subscription.topic,
				serverUrl: subscription.serverUrl,
				displayName: subscription.displayName ?? null,
			}),
		),

	/** `localOnly` skips removing it from the ntfy account. */
	remove: async (id: string, localOnly = false) => {
		await call(commands.removeSubscription(id, localOnly));
	},

	toggleMute: (id: string) => call(commands.toggleMute(id)),
};

// ===== Ignore Rules API =====

export const ignoreRulesApi = {
	getAll: () => call(commands.getIgnoreRules()),

	add: (pattern: string, subscriptionId: string | null) =>
		call(commands.addIgnoreRule(pattern, subscriptionId)),

	delete: async (id: string) => {
		await call(commands.deleteIgnoreRule(id));
	},
};

// ===== Notifications API =====

export const notificationsApi = {
	getBySubscription: (subscriptionId: string) =>
		call(commands.getNotifications(subscriptionId)),

	markAsRead: async (id: string) => {
		await call(commands.markAsRead(id));
	},

	markAllAsRead: async (subscriptionId: string) => {
		await call(commands.markAllAsRead(subscriptionId));
	},

	delete: async (id: string) => {
		await call(commands.deleteNotification(id));
	},

	openUrl: async (url: string) => {
		await call(commands.openUrl(url));
	},

	runAction: async (notificationId: string, actionId: string) => {
		await call(commands.runAction(notificationId, actionId));
	},

	setExpanded: async (id: string, expanded: boolean) => {
		await call(commands.setNotificationExpanded(id, expanded));
	},

	getUnreadCount: (subscriptionId: string) =>
		call(commands.getUnreadCount(subscriptionId)),

	setFavorite: async (id: string, favorite: boolean) => {
		await call(commands.setNotificationFavorite(id, favorite));
	},

	getFavorites: () => call(commands.getFavoriteNotifications()),
};

// ===== Settings API =====

export const settingsApi = {
	get: () => call(commands.getSettings()),

	addServer: (server: Omit<ServerConfig, "isDefault">) =>
		call(
			commands.addServer({
				...server,
				isDefault: false,
			}),
		),

	updateServer: (server: Omit<ServerConfig, "isDefault">) =>
		call(commands.updateServer({ ...server, isDefault: false })),

	getServerStatuses: () => call(commands.getServerStatuses()),

	removeServer: async (url: string) => {
		await call(commands.removeServer(url));
	},

	setDefaultServer: async (url: string) => {
		await call(commands.setDefaultServer(url));
	},

	setMinimizeToTray: async (enabled: boolean) => {
		await call(commands.setMinimizeToTray(enabled));
	},

	setStartMinimized: async (enabled: boolean) => {
		await call(commands.setStartMinimized(enabled));
	},

	setNotificationMethod: async (method: NotificationDisplayMethod) => {
		await call(commands.setNotificationMethod(method));
	},

	setNotificationForceDisplay: async (enabled: boolean) => {
		await call(commands.setNotificationForceDisplay(enabled));
	},

	setNotificationShowActions: async (enabled: boolean) => {
		await call(commands.setNotificationShowActions(enabled));
	},

	setNotificationShowImages: async (enabled: boolean) => {
		await call(commands.setNotificationShowImages(enabled));
	},

	setNotificationSound: async (enabled: boolean) => {
		await call(commands.setNotificationSound(enabled));
	},

	setCompactView: async (enabled: boolean) => {
		await call(commands.setCompactView(enabled));
	},

	setExpandNewMessages: async (enabled: boolean) => {
		await call(commands.setExpandNewMessages(enabled));
	},

	setDeleteLocalOnly: async (enabled: boolean) => {
		await call(commands.setDeleteLocalOnly(enabled));
	},

	setRetentionMaxAgeDays: async (days: number | null) => {
		await call(commands.setRetentionMaxAgeDays(days));
	},
	setRetentionMaxPerSubscription: async (max: number | null) => {
		await call(commands.setRetentionMaxPerSubscription(max));
	},

	setFavoritesEnabled: async (enabled: boolean) => {
		await call(commands.setFavoritesEnabled(enabled));
	},

	openWindow: async (editServerUrl: string | null = null) => {
		await call(commands.openSettingsWindow(editServerUrl));
	},
};

// ===== Sync API =====

export const syncApi = {
	/** Sync subscriptions from a server with credentials */
	syncSubscriptions: (serverUrl: string) =>
		call(commands.syncSubscriptions(serverUrl)),
};

// ===== Autostart API =====

export const autostartApi = {
	enable: () => autostartEnable(),
	disable: () => autostartDisable(),
	isEnabled: () => autostartIsEnabled(),
};

// ===== Update API =====

export const updateApi = {
	/** Check for available updates */
	checkForUpdate: (): Promise<UpdateInfo | null> =>
		call(commands.checkForUpdate()),

	/** Result of the latest update check, null if none ran or it found no update */
	getLastCheck: (): Promise<UpdateInfo | null> => commands.getLastUpdateCheck(),

	/** Install the available update */
	installUpdate: async (): Promise<void> => {
		await call(commands.installUpdate());
	},
};

// ===== Utility to check if running in Tauri =====

export const isTauri = (): boolean => {
	return isTauriCore();
};
