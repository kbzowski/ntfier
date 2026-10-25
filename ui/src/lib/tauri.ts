/**
 * @module lib/tauri
 *
 * Tauri backend API bindings.
 *
 * Provides typed wrappers around generated bindings that convert Result pattern
 * to exceptions for easier use in async/await code. Falls back gracefully when
 * not running in Tauri.
 */

import { isTauri as isTauriCore } from "@tauri-apps/api/core";
import {
	disable as autostartDisable,
	enable as autostartEnable,
	isEnabled as autostartIsEnabled,
} from "@tauri-apps/plugin-autostart";

import {
	type AppError,
	type AppSettings,
	type CreateSubscription,
	commands,
	type IgnoreRule,
	type Notification,
	type NotificationDisplayMethod,
	type ServerConfig,
	type Subscription,
	type UpdateInfo,
} from "@/types/bindings";
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

// tauri-specta stopped exporting this alias in 2.0.0-rc.25; shape mirrors its `typedError` helper.
type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };

/**
 * Unwraps a Result from generated bindings, throwing on error.
 *
 * This allows using the Result-based generated commands with try/catch syntax.
 */
function unwrap<T>(result: Result<T, AppError>): T {
	if (result.status === "ok") {
		return result.data;
	}
	throw new BackendError(
		getErrorMessage(result.error),
		Object.keys(result.error)[0] ?? "",
	);
}

// ===== Subscriptions API =====

export const subscriptionsApi = {
	getAll: async () => unwrap(await commands.getSubscriptions()),

	add: async (subscription: {
		topic: string;
		serverUrl: string;
		displayName?: string;
	}) =>
		unwrap(
			await commands.addSubscription({
				topic: subscription.topic,
				serverUrl: subscription.serverUrl,
				displayName: subscription.displayName ?? null,
			}),
		),

	/** `localOnly` skips removing it from the ntfy account. */
	remove: async (id: string, localOnly = false) => {
		unwrap(await commands.removeSubscription(id, localOnly));
	},

	toggleMute: async (id: string) => unwrap(await commands.toggleMute(id)),
};

// ===== Ignore Rules API =====

export const ignoreRulesApi = {
	getAll: async () => unwrap(await commands.getIgnoreRules()),

	add: async (pattern: string, subscriptionId: string | null) =>
		unwrap(await commands.addIgnoreRule(pattern, subscriptionId)),

	delete: async (id: string) => {
		unwrap(await commands.deleteIgnoreRule(id));
	},
};

// ===== Notifications API =====

export const notificationsApi = {
	getBySubscription: async (subscriptionId: string) =>
		unwrap(await commands.getNotifications(subscriptionId)),

	markAsRead: async (id: string) => {
		unwrap(await commands.markAsRead(id));
	},

	markAllAsRead: async (subscriptionId: string) => {
		unwrap(await commands.markAllAsRead(subscriptionId));
	},

	delete: async (id: string) => {
		unwrap(await commands.deleteNotification(id));
	},

	openUrl: async (url: string) => {
		unwrap(await commands.openUrl(url));
	},

	runAction: async (notificationId: string, actionId: string) => {
		unwrap(await commands.runAction(notificationId, actionId));
	},

	setExpanded: async (id: string, expanded: boolean) => {
		unwrap(await commands.setNotificationExpanded(id, expanded));
	},

	getUnreadCount: async (subscriptionId: string) =>
		unwrap(await commands.getUnreadCount(subscriptionId)),

	setFavorite: async (id: string, favorite: boolean) => {
		unwrap(await commands.setNotificationFavorite(id, favorite));
	},

	getFavorites: async () => unwrap(await commands.getFavoriteNotifications()),
};

// ===== Settings API =====

export const settingsApi = {
	get: async () => unwrap(await commands.getSettings()),

	addServer: async (server: Omit<ServerConfig, "isDefault">) =>
		unwrap(
			await commands.addServer({
				...server,
				isDefault: false,
			}),
		),

	updateServer: async (server: Omit<ServerConfig, "isDefault">) =>
		unwrap(await commands.updateServer({ ...server, isDefault: false })),

	getServerStatuses: async () => unwrap(await commands.getServerStatuses()),

	removeServer: async (url: string) => {
		unwrap(await commands.removeServer(url));
	},

	setDefaultServer: async (url: string) => {
		unwrap(await commands.setDefaultServer(url));
	},

	setMinimizeToTray: async (enabled: boolean) => {
		unwrap(await commands.setMinimizeToTray(enabled));
	},

	setStartMinimized: async (enabled: boolean) => {
		unwrap(await commands.setStartMinimized(enabled));
	},

	setNotificationMethod: async (method: NotificationDisplayMethod) => {
		unwrap(await commands.setNotificationMethod(method));
	},

	setNotificationForceDisplay: async (enabled: boolean) => {
		unwrap(await commands.setNotificationForceDisplay(enabled));
	},

	setNotificationShowActions: async (enabled: boolean) => {
		unwrap(await commands.setNotificationShowActions(enabled));
	},

	setNotificationShowImages: async (enabled: boolean) => {
		unwrap(await commands.setNotificationShowImages(enabled));
	},

	setNotificationSound: async (enabled: boolean) => {
		unwrap(await commands.setNotificationSound(enabled));
	},

	setCompactView: async (enabled: boolean) => {
		unwrap(await commands.setCompactView(enabled));
	},

	setExpandNewMessages: async (enabled: boolean) => {
		unwrap(await commands.setExpandNewMessages(enabled));
	},

	setDeleteLocalOnly: async (enabled: boolean) => {
		unwrap(await commands.setDeleteLocalOnly(enabled));
	},

	setRetentionMaxAgeDays: async (days: number | null) => {
		unwrap(await commands.setRetentionMaxAgeDays(days));
	},
	setRetentionMaxPerSubscription: async (max: number | null) => {
		unwrap(await commands.setRetentionMaxPerSubscription(max));
	},

	setFavoritesEnabled: async (enabled: boolean) => {
		unwrap(await commands.setFavoritesEnabled(enabled));
	},
};

// ===== Sync API =====

export const syncApi = {
	/** Sync subscriptions from a server with credentials */
	syncSubscriptions: async (serverUrl: string) =>
		unwrap(await commands.syncSubscriptions(serverUrl)),
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
	checkForUpdate: async (): Promise<UpdateInfo | null> => {
		const result = await commands.checkForUpdate();
		return unwrap(result);
	},

	/** Install the available update */
	installUpdate: async (): Promise<void> => {
		unwrap(await commands.installUpdate());
	},
};

// ===== Utility to check if running in Tauri =====

export const isTauri = (): boolean => {
	return isTauriCore();
};
