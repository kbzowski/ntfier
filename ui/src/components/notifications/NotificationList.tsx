import CheckCheck from "lucide-react/dist/esm/icons/check-check";
import Hash from "lucide-react/dist/esm/icons/hash";
import Inbox from "lucide-react/dist/esm/icons/inbox";
import Star from "lucide-react/dist/esm/icons/star";
import {
	memo,
	type ReactNode,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
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

interface NotificationListHeaderProps {
	icon: ReactNode;
	title: string;
	unreadCount: number;
	onMarkAllAsRead: () => void;
}

const NotificationListHeader = memo(function NotificationListHeader({
	icon,
	title,
	unreadCount,
	onMarkAllAsRead,
}: NotificationListHeaderProps) {
	return (
		<div className="flex items-center justify-between px-6 py-4 border-b border-border">
			<div className="flex items-center gap-2">
				{icon}
				<h1 className="text-lg font-semibold">{title}</h1>
				{unreadCount > 0 ? (
					<span className="text-sm text-muted-foreground">
						({unreadCount} unread)
					</span>
				) : null}
			</div>
			{unreadCount > 0 ? (
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
			) : null}
		</div>
	);
});

function getHeaderIcon(
	isFavoritesView: boolean,
	isAllView: boolean,
): ReactNode {
	if (isFavoritesView) return <Star className="h-5 w-5 text-yellow-500" />;
	if (isAllView) return <Inbox className="h-5 w-5 text-muted-foreground" />;
	return <Hash className="h-5 w-5 text-muted-foreground" />;
}

interface NotificationListProps {
	subscription: Subscription | null;
	subscriptions?: Subscription[];
	notifications: NotificationType[];
	onMarkAsRead: (id: string) => void;
	onMarkAllAsRead: () => void;
	onDelete: (id: string) => void;
	onToggleFavorite?: (id: string) => void;
	onExpandedChange?: (id: string, expanded: boolean) => void;
	compactView?: boolean;
	isFavoritesView?: boolean;
}

export const NotificationList = memo(function NotificationList({
	subscription,
	subscriptions = [],
	notifications,
	onMarkAsRead,
	onMarkAllAsRead,
	onDelete,
	onToggleFavorite,
	onExpandedChange,
	compactView = false,
	isFavoritesView = false,
}: NotificationListProps) {
	const isAllView = !subscription && !isFavoritesView;
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

	// Scroll to top when window is shown (tray icon click)
	useTauriEvent("window:shown", () => {
		scrollContainerRef.current?.scrollTo({ top: 0 });
	});

	const handleDelete = useCallback(
		(id: string) => {
			setDeletingIds((prev) => new Set(prev).add(id));
			// Wait for animation to finish, then actually delete
			setTimeout(() => {
				setDeletingIds((prev) => {
					const next = new Set(prev);
					next.delete(id);
					return next;
				});
				onDelete(id);
			}, 300);
		},
		[onDelete],
	);

	const handleExpandedChange = useCallback(
		(notificationId: string, expanded: boolean) => {
			// Persist expanded state to database
			notificationsApi.setExpanded(notificationId, expanded).catch((err) => {
				console.error("[Background] Failed to persist expand state:", err);
			});
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

	const unreadCount = useMemo(() => {
		let count = 0;
		for (const n of notifications) {
			if (!n.read) count++;
		}
		return count;
	}, [notifications]);

	if (isAllView && subscriptions.length === 0) {
		return <EmptyState type="no-topic" />;
	}

	const showTopicName = isAllView || isFavoritesView;
	const headerTitle = isFavoritesView
		? "Favorites"
		: isAllView
			? "All Notifications"
			: subscription?.displayName || subscription?.topic;

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<NotificationListHeader
				icon={getHeaderIcon(isFavoritesView, isAllView)}
				title={headerTitle}
				unreadCount={unreadCount}
				onMarkAllAsRead={onMarkAllAsRead}
			/>

			{notifications.length === 0 ? (
				<EmptyState type="no-notifications" />
			) : (
				<div
					ref={scrollContainerRef}
					className="flex-1 overflow-y-auto min-h-0"
				>
					<div className="p-3 space-y-1.5">
						{notifications.map((notification) => (
							<div
								key={notification.id}
								className={
									deletingIds.has(notification.id)
										? "notification-deleting"
										: undefined
								}
								style={{
									contentVisibility: "auto",
									containIntrinsicSize: "auto 80px",
								}}
							>
								<NotificationCard
									notification={notification}
									topicName={
										showTopicName
											? topicNames.get(notification.topicId)
											: undefined
									}
									onMarkAsRead={onMarkAsRead}
									onDelete={handleDelete}
									onToggleFavorite={onToggleFavorite}
									isCollapsible={compactView}
									isExpanded={!compactView || notification.isExpanded}
									onExpandedChange={handleExpandedChange}
								/>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
});
