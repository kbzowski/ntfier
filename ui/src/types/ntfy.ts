// Specta splits types into `_Serialize` (what Rust sends) and `_Deserialize` (what it
// accepts); the UI uses what Rust sends, which every command also accepts.
export type {
	AppError,
	AppSettings_Serialize as AppSettings,
	Attachment_Serialize as Attachment,
	CreateSubscription_Deserialize as CreateSubscription,
	IgnoreRule_Serialize as IgnoreRule,
	Notification_Serialize as Notification,
	NotificationAction_Serialize as NotificationAction,
	NotificationDisplayMethod,
	ServerConfig_Serialize as ServerConfig,
	ServerStatus,
	ServerStatusEntry,
	Subscription_Serialize as Subscription,
	SubscriptionError_Serialize as SubscriptionError,
	ThemeChanged,
	UpdateInfo_Serialize as UpdateInfo,
} from "./bindings";

// Type alias for notification priority (1-5 scale)
export type NotificationPriority = 1 | 2 | 3 | 4 | 5;
