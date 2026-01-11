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
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
	type Notification,
	type Result,
	type ServerConfig,
	type Subscription,
} from "@/types/bindings";

// Re-export types for consumers
export type {
	AppError,
	CreateSubscription,
	ServerConfig,
	Subscription,
	Notification,
	AppSettings,
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
 * Unwraps a Result from generated bindings, throwing on error.
 *
 * This allows using the Result-based generated commands with try/catch syntax.
 */
function unwrap<T>(result: Result<T, AppError>): T {
	if (result.status === "ok") {
		return result.data;
	}
	throw new Error(getErrorMessage(result.error));
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

	remove: async (id: string) => {
		unwrap(await commands.removeSubscription(id));
	},

	toggleMute: async (id: string) => unwrap(await commands.toggleMute(id)),
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

	getUnreadCount: async (subscriptionId: string) =>
		unwrap(await commands.getUnreadCount(subscriptionId)),
};

// ===== Settings API =====

export const settingsApi = {
	get: async () => unwrap(await commands.getSettings()),

	setTheme: async (theme: string) => {
		unwrap(await commands.setTheme(theme));
	},

	addServer: async (server: Omit<ServerConfig, "isDefault">) => {
		unwrap(
			await commands.addServer({
				...server,
				isDefault: false,
			}),
		);
	},

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
};

// ===== Sync API =====

export const syncApi = {
	/** Sync subscriptions from a server with credentials */
	syncSubscriptions: async (serverUrl: string) =>
		unwrap(await commands.syncSubscriptions(serverUrl)),
};

// ===== Event Listeners =====

export const events = {
	onNewNotification: (
		callback: (notification: Notification) => void,
	): Promise<UnlistenFn> =>
		listen<Notification>("notification:new", (event) =>
			callback(event.payload),
		),

	onSubscriptionsSynced: (callback: () => void): Promise<UnlistenFn> =>
		listen<void>("subscriptions:synced", () => callback()),

	onNavigateSubscription: (
		callback: (subscriptionId: string) => void,
	): Promise<UnlistenFn> =>
		listen<string>("navigate:subscription", (event) => callback(event.payload)),
};

// ===== Autostart API =====

export const autostartApi = {
	enable: () => autostartEnable(),
	disable: () => autostartDisable(),
	isEnabled: () => autostartIsEnabled(),
};

// ===== Utility to check if running in Tauri =====

export const isTauri = (): boolean => {
	return isTauriCore();
};
