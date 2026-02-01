import { CheckCheck, Hash, Inbox } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { notificationsApi } from "@/lib/tauri";
import type {
	Notification as NotificationType,
	Subscription,
} from "@/types/ntfy";
import { EmptyState } from "./EmptyState";
import { NotificationCard } from "./NotificationCard";

interface NotificationListProps {
	subscription: Subscription | null;
	subscriptions?: Subscription[];
	notifications: NotificationType[];
	onMarkAsRead: (id: string) => void;
	onMarkAllAsRead: () => void;
	onExpandedChange?: (id: string, expanded: boolean) => void;
	compactView?: boolean;
	expandNewMessages?: boolean;
}

export const NotificationList = memo(function NotificationList({
	subscription,
	subscriptions = [],
	notifications,
	onMarkAsRead,
	onMarkAllAsRead,
	onExpandedChange,
	compactView = false,
	expandNewMessages = true,
}: NotificationListProps) {
	const isAllView = !subscription;
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const prevNotificationIdsRef = useRef<Set<string>>(new Set());

	// Scroll to top when window is shown (tray icon click)
	useTauriEvent("window:shown", () => {
		scrollContainerRef.current?.scrollTo({ top: 0 });
	});

	// Detect new notifications and auto-expand if enabled
	useEffect(() => {
		if (!compactView) return;

		const currentIds = new Set(notifications.map((n) => n.id));
		const prevIds = prevNotificationIdsRef.current;

		if (expandNewMessages) {
			// Find newly added notification IDs
			const newIds = [...currentIds].filter((id) => !prevIds.has(id));
			if (newIds.length > 0) {
				// Auto-expand new notifications and persist to database
				for (const id of newIds) {
					notificationsApi.setExpanded(id, true).catch(console.error);
				}
				// Notify parent to refresh notifications
				if (onExpandedChange) {
					for (const id of newIds) {
						onExpandedChange(id, true);
					}
				}
			}
		}

		prevNotificationIdsRef.current = currentIds;
	}, [notifications, compactView, expandNewMessages, onExpandedChange]);

	const handleExpandedChange = useCallback(
		(notificationId: string, expanded: boolean) => {
			// Persist expanded state to database
			notificationsApi.setExpanded(notificationId, expanded).catch(console.error);
			// Notify parent to update local state
			if (onExpandedChange) {
				onExpandedChange(notificationId, expanded);
			}
		},
		[onExpandedChange],
	);

	// Create lookup map for topic names
	const topicNames = useMemo(() => {
		const map = new Map<string, string>();
		for (const sub of subscriptions) {
			map.set(sub.id, sub.displayName || sub.topic);
		}
		return map;
	}, [subscriptions]);

	if (isAllView && subscriptions.length === 0) {
		return <EmptyState type="no-topic" />;
	}

	const unreadCount = notifications.filter((n) => !n.read).length;

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<div className="flex items-center justify-between px-6 py-4 border-b border-border">
				<div className="flex items-center gap-2">
					{isAllView ? (
						<Inbox className="h-5 w-5 text-muted-foreground" />
					) : (
						<Hash className="h-5 w-5 text-muted-foreground" />
					)}
					<h1 className="text-lg font-semibold">
						{isAllView
							? "All Notifications"
							: subscription.displayName || subscription.topic}
					</h1>
					{unreadCount > 0 && (
						<span className="text-sm text-muted-foreground">
							({unreadCount} unread)
						</span>
					)}
				</div>
				{unreadCount > 0 && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="gap-2"
									onClick={onMarkAllAsRead}
								>
									<CheckCheck className="h-4 w-4" />
									Mark all read
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Mark all notifications as read</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>

			{notifications.length === 0 ? (
				<EmptyState type="no-notifications" />
			) : (
				<div
					ref={scrollContainerRef}
					className="flex-1 overflow-y-auto min-h-0"
				>
					<div className="p-4 space-y-3">
						{notifications.map((notification, index) => (
							<div key={notification.id}>
								<NotificationCard
									notification={notification}
									topicName={
										isAllView ? topicNames.get(notification.topicId) : undefined
									}
									onMarkAsRead={onMarkAsRead}
									isCollapsible={compactView}
									isExpanded={!compactView || notification.isExpanded}
									onExpandedChange={(expanded) =>
										handleExpandedChange(notification.id, expanded)
									}
								/>
								{index < notifications.length - 1 && (
									<Separator className="my-3 opacity-0" />
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
});
