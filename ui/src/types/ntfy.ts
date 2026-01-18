// Re-export all types from auto-generated bindings
export type {
	AppSettings,
	Attachment,
	Notification,
	NotificationAction,
	ServerConfig,
	Subscription,
	ThemeMode,
	UpdateInfo,
} from "./bindings";

// Type alias for notification priority (1-5 scale)
export type NotificationPriority = 1 | 2 | 3 | 4 | 5;
