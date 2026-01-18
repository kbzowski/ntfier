import type { AppSettings, Notification, Subscription } from "@/types/ntfy";

export const mockSubscriptions: Subscription[] = [
	{
		id: "sub-1",
		topic: "homelab-alerts",
		serverUrl: "https://ntfy.sh",
		displayName: "HomeLab Alerts",
		unreadCount: 3,
		lastNotification: Date.now() - 1000 * 60 * 5,
		muted: false,
	},
	{
		id: "sub-2",
		topic: "github-actions",
		serverUrl: "https://ntfy.sh",
		displayName: "GitHub Actions",
		unreadCount: 0,
		lastNotification: Date.now() - 1000 * 60 * 60 * 2,
		muted: false,
	},
	{
		id: "sub-3",
		topic: "backup-status",
		serverUrl: "https://ntfy.example.com",
		displayName: "Backup Status",
		unreadCount: 1,
		lastNotification: Date.now() - 1000 * 60 * 30,
		muted: true,
	},
	{
		id: "sub-4",
		topic: "security-alerts",
		serverUrl: "https://ntfy.sh",
		displayName: "Security Alerts",
		unreadCount: 5,
		lastNotification: Date.now() - 1000 * 60 * 2,
		muted: false,
	},
];

export const mockNotifications: Notification[] = [
	{
		id: "notif-1",
		topicId: "sub-1",
		title: "Disk Space Warning",
		message:
			"Server nas-01 has less than 10% disk space remaining on /dev/sda1. Current usage: 91%. Consider cleaning up old files or expanding storage.",
		priority: 4,
		tags: ["warning", "disk", "nas-01"],
		timestamp: Date.now() - 1000 * 60 * 5,
		actions: [
			{
				id: "act-1",
				label: "Open Dashboard",
				url: "https://dashboard.example.com",
				method: null,
				clear: false,
			},
			{ id: "act-2", label: "Dismiss", url: null, method: null, clear: true },
		],
		attachments: [],
		read: false,
	},
	{
		id: "notif-2",
		topicId: "sub-1",
		title: "Container Restart",
		message:
			'Docker container "nginx-proxy" restarted automatically due to health check failure.',
		priority: 3,
		tags: ["docker", "nginx", "restart"],
		timestamp: Date.now() - 1000 * 60 * 15,
		actions: [
			{
				id: "act-3",
				label: "View Logs",
				url: "https://logs.example.com/nginx",
				method: null,
				clear: false,
			},
		],
		attachments: [],
		read: false,
	},
	{
		id: "notif-3",
		topicId: "sub-1",
		title: "System Update Available",
		message:
			"New system updates are available for server ubuntu-server-01. 15 packages can be upgraded.",
		priority: 2,
		tags: ["update", "ubuntu"],
		timestamp: Date.now() - 1000 * 60 * 60,
		actions: [],
		attachments: [],
		read: true,
	},
	{
		id: "notif-4",
		topicId: "sub-4",
		title: "CRITICAL: Unauthorized Access Attempt",
		message:
			"Multiple failed SSH login attempts detected from IP 192.168.1.100. 15 attempts in the last 5 minutes. IP has been automatically blocked.",
		priority: 5,
		tags: ["critical", "security", "ssh", "blocked"],
		timestamp: Date.now() - 1000 * 60 * 2,
		actions: [
			{
				id: "act-4",
				label: "View Security Log",
				url: "https://security.example.com/logs",
				method: null,
				clear: false,
			},
			{
				id: "act-5",
				label: "Unblock IP",
				url: null,
				method: "POST",
				clear: false,
			},
		],
		attachments: [
			{
				id: "attach-1",
				name: "security-report.png",
				type: "image/png",
				url: "https://via.placeholder.com/800x400/1a1a2e/ffffff?text=Security+Report",
				size: 125000,
			},
		],
		read: false,
	},
	{
		id: "notif-5",
		topicId: "sub-4",
		title: "Firewall Rule Updated",
		message:
			"Firewall rule #42 has been automatically updated to block suspicious traffic from subnet 10.0.0.0/8.",
		priority: 4,
		tags: ["firewall", "security", "auto-update"],
		timestamp: Date.now() - 1000 * 60 * 10,
		actions: [
			{
				id: "act-6",
				label: "Review Rules",
				url: "https://firewall.example.com",
				method: null,
				clear: false,
			},
		],
		attachments: [],
		read: false,
	},
	{
		id: "notif-6",
		topicId: "sub-4",
		title: "SSL Certificate Expiring",
		message:
			"SSL certificate for api.example.com will expire in 7 days. Please renew to avoid service disruption.",
		priority: 4,
		tags: ["ssl", "certificate", "warning"],
		timestamp: Date.now() - 1000 * 60 * 30,
		actions: [
			{
				id: "act-7",
				label: "Renew Now",
				url: "https://certs.example.com/renew",
				method: null,
				clear: false,
			},
		],
		attachments: [],
		read: false,
	},
	{
		id: "notif-7",
		topicId: "sub-4",
		title: "New Device Connected",
		message:
			"New device 'iPhone-15' connected to the network. MAC: AA:BB:CC:DD:EE:FF. Location: Office WiFi.",
		priority: 3,
		tags: ["network", "device", "info"],
		timestamp: Date.now() - 1000 * 60 * 45,
		actions: [
			{
				id: "act-8",
				label: "View Devices",
				url: "https://network.example.com/devices",
				method: null,
				clear: false,
			},
		],
		attachments: [],
		read: true,
	},
	{
		id: "notif-8",
		topicId: "sub-4",
		title: "VPN Connection Established",
		message:
			"VPN connection established from user admin@example.com. IP: 203.0.113.50, Location: Warsaw, PL.",
		priority: 2,
		tags: ["vpn", "connection", "info"],
		timestamp: Date.now() - 1000 * 60 * 60,
		actions: [],
		attachments: [],
		read: true,
	},
	{
		id: "notif-9",
		topicId: "sub-2",
		title: "Build Successful",
		message:
			'GitHub Actions workflow "CI/CD Pipeline" completed successfully for repository my-app. All 42 tests passed.',
		priority: 1,
		tags: ["success", "ci", "build"],
		timestamp: Date.now() - 1000 * 60 * 60 * 2,
		actions: [
			{
				id: "act-9",
				label: "View Run",
				url: "https://github.com/user/repo/actions/runs/123",
				method: null,
				clear: false,
			},
		],
		attachments: [],
		read: true,
	},
	{
		id: "notif-10",
		topicId: "sub-3",
		title: "Daily Backup Completed",
		message:
			"Nightly backup job finished successfully. Total size: 2.4 GB. Duration: 12 minutes.",
		priority: 3,
		tags: ["backup", "success", "daily"],
		timestamp: Date.now() - 1000 * 60 * 30,
		actions: [],
		attachments: [
			{
				id: "attach-2",
				name: "backup-log-2024-01-06.txt",
				type: "text/plain",
				url: "https://example.com/backups/log.txt",
				size: 4500,
			},
		],
		read: false,
	},
	{
		id: "notif-11",
		topicId: "sub-1",
		title: "Server Status Check",
		message:
			"Routine status check completed. All services are running normally. Memory usage: 62%, CPU: 23%.",
		priority: 3,
		tags: [],
		timestamp: Date.now() - 1000 * 60 * 20,
		actions: [],
		attachments: [],
		read: false,
	},
	{
		id: "notif-12",
		topicId: "sub-1",
		title: "Grafana Dashboard Snapshot",
		message:
			"Weekly performance report generated. Server metrics for the past 7 days are attached below.",
		priority: 3,
		tags: ["grafana", "report", "weekly"],
		timestamp: Date.now() - 1000 * 60 * 25,
		actions: [
			{
				id: "act-10",
				label: "Open Grafana",
				url: "https://grafana.example.com",
				method: null,
				clear: false,
			},
		],
		attachments: [
			{
				id: "attach-3",
				name: "grafana-dashboard.png",
				type: "image/png",
				url: "https://picsum.photos/800/400",
				size: 245000,
			},
		],
		read: false,
	},
	{
		id: "notif-13",
		topicId: "sub-2",
		title: "Deployment Preview Ready",
		message:
			"Preview deployment for PR #127 is ready. Branch: feature/new-dashboard. Screenshot attached.",
		priority: 3,
		tags: ["preview", "deployment"],
		timestamp: Date.now() - 1000 * 60 * 45,
		actions: [
			{
				id: "act-11",
				label: "View Preview",
				url: "https://preview-127.example.com",
				method: null,
				clear: false,
			},
			{
				id: "act-12",
				label: "View PR",
				url: "https://github.com/user/repo/pull/127",
				method: null,
				clear: false,
			},
		],
		attachments: [
			{
				id: "attach-4",
				name: "preview-screenshot.png",
				type: "image/png",
				url: "https://picsum.photos/seed/dashboard/800/450",
				size: 189000,
			},
		],
		read: false,
	},
];

export const mockSettings: AppSettings = {
	theme: "system",
	servers: [
		{
			url: "https://ntfy.sh",
			username: null,
			password: null,
			isDefault: true,
		},
		{
			url: "https://ntfy.example.com",
			username: "admin",
			password: "********",
			isDefault: false,
		},
	],
	defaultServer: "https://ntfy.sh",
	minimizeToTray: true,
	startMinimized: false,
};
