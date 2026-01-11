/**
 * @module lib/tauri
 *
 * Tauri backend API bindings.
 *
 * Provides typed wrappers around Tauri's invoke function for calling
 * backend commands. Falls back gracefully when not running in Tauri.
 */

import { invoke, isTauri as isTauriCore } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	disable as autostartDisable,
	enable as autostartEnable,
	isEnabled as autostartIsEnabled,
} from "@tauri-apps/plugin-autostart";
import type {
	AppSettings,
	Notification,
	ServerConfig,
	Subscription,
} from "@/types/ntfy";

// ===== Subscriptions API =====

export const subscriptionsApi = {
	getAll: () => invoke<Subscription[]>("get_subscriptions"),

	add: (subscription: {
		topic: string;
		serverUrl: string;
		displayName?: string;
	}) => invoke<Subscription>("add_subscription", { subscription }),

	remove: (id: string) => invoke<void>("remove_subscription", { id }),

	toggleMute: (id: string) => invoke<Subscription>("toggle_mute", { id }),
};

// ===== Notifications API =====

export const notificationsApi = {
	getBySubscription: (subscriptionId: string) =>
		invoke<Notification[]>("get_notifications", { subscriptionId }),

	markAsRead: (id: string) => invoke<void>("mark_as_read", { id }),

	markAllAsRead: (subscriptionId: string) =>
		invoke<void>("mark_all_as_read", { subscriptionId }),

	delete: (id: string) => invoke<void>("delete_notification", { id }),

	getUnreadCount: (subscriptionId: string) =>
		invoke<number>("get_unread_count", { subscriptionId }),
};

// ===== Settings API =====

export const settingsApi = {
	get: () => invoke<AppSettings>("get_settings"),

	setTheme: (theme: string) => invoke<void>("set_theme", { theme }),

	addServer: (server: Omit<ServerConfig, "isDefault">) =>
		invoke<void>("add_server", { server: { ...server, isDefault: false } }),

	removeServer: (url: string) => invoke<void>("remove_server", { url }),

	setDefaultServer: (url: string) =>
		invoke<void>("set_default_server", { url }),

	setMinimizeToTray: (enabled: boolean) =>
		invoke<void>("set_minimize_to_tray", { enabled }),

	setStartMinimized: (enabled: boolean) =>
		invoke<void>("set_start_minimized", { enabled }),
};

// ===== Sync API =====

export const syncApi = {
	/** Sync subscriptions from a server with credentials */
	syncSubscriptions: (serverUrl: string) =>
		invoke<Subscription[]>("sync_subscriptions", { serverUrl }),
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
// Uses the official Tauri 2.x API for detection

export const isTauri = (): boolean => {
	return isTauriCore();
};
