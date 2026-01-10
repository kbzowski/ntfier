export type NotificationPriority = 1 | 2 | 3 | 4 | 5;

export interface NotificationAction {
	id: string;
	label: string;
	url?: string;
	method?: "GET" | "POST" | "PUT" | "DELETE";
	clear?: boolean;
}

export interface Attachment {
	id: string;
	name: string;
	type: "image" | "file";
	url: string;
	size?: number;
}

export interface Notification {
	id: string;
	topicId: string;
	title: string;
	message: string;
	priority: NotificationPriority;
	tags: string[];
	timestamp: number;
	actions: NotificationAction[];
	attachments: Attachment[];
	read: boolean;
}

export interface Subscription {
	id: string;
	topic: string;
	serverUrl: string;
	displayName?: string;
	unreadCount: number;
	lastNotification?: number;
	muted: boolean;
}

export interface ServerConfig {
	url: string;
	username?: string;
	password?: string;
	isDefault: boolean;
}

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
	theme: ThemeMode;
	servers: ServerConfig[];
	defaultServer: string;
	minimizeToTray: boolean;
	startMinimized: boolean;
}
