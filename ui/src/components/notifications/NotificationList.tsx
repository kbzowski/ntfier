import { CheckCheck, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
	Notification as NotificationType,
	Subscription,
} from "@/types/ntfy";
import { EmptyState } from "./EmptyState";
import { NotificationCard } from "./NotificationCard";

interface NotificationListProps {
	subscription: Subscription | null;
	notifications: NotificationType[];
	onMarkAsRead: (id: string) => void;
	onMarkAllAsRead: () => void;
}

export function NotificationList({
	subscription,
	notifications,
	onMarkAsRead,
	onMarkAllAsRead,
}: NotificationListProps) {
	if (!subscription) {
		return <EmptyState type="no-topic" />;
	}

	const unreadCount = notifications.filter((n) => !n.read).length;

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<div className="flex items-center justify-between px-6 py-4 border-b border-border">
				<div className="flex items-center gap-2">
					<Hash className="h-5 w-5 text-muted-foreground" />
					<h1 className="text-lg font-semibold">
						{subscription.displayName || subscription.topic}
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
				<div className="flex-1 overflow-y-auto min-h-0">
					<div className="p-4 space-y-3">
						{notifications.map((notification, index) => (
							<div key={notification.id}>
								<NotificationCard
									notification={notification}
									onClick={() => onMarkAsRead(notification.id)}
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
}
