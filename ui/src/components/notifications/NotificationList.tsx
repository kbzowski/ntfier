import { CheckCheck, Eye, EyeOff, Hash, Inbox, Star } from "lucide-react";
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
import { cn } from "@/lib/utils";
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
	showIgnored: boolean;
	onShowIgnoredChange: (show: boolean) => void;
	hasIgnored: boolean;
}

const NotificationListHeader = memo(function NotificationListHeader({
	icon,
	title,
	unreadCount,
	onMarkAllAsRead,
	showIgnored,
	onShowIgnoredChange,
	hasIgnored,
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
			<div className="flex items-center gap-2">
				{hasIgnored ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onShowIgnoredChange(!showIgnored)}
					>
						{showIgnored ? (
							<EyeOff className="h-4 w-4" />
						) : (
							<Eye className="h-4 w-4" />
						)}
						{showIgnored ? "Hide ignored" : "Show ignored"}
					</Button>
				) : null}
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

const EMPTY_SUBSCRIPTIONS: Subscription[] = [];

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
	subscriptions = EMPTY_SUBSCRIPTIONS,
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
	const [showIgnored, setShowIgnored] = useState(false);

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
			if (!n.read && !n.ignored) count++;
		}
		return count;
	}, [notifications]);

	const hasIgnored = useMemo(
		() => notifications.some((n) => n.ignored),
		[notifications],
	);

	const visibleNotifications = useMemo(
		() =>
			showIgnored ? notifications : notifications.filter((n) => !n.ignored),
		[notifications, showIgnored],
	);

	if (isAllView && subscriptions.length === 0) {
		return <EmptyState type="no-topic" />;
	}

	const showTopicName = isAllView || isFavoritesView;
	const headerTitle = isFavoritesView
		? "Favorites"
		: subscription
			? subscription.displayName || subscription.topic
			: "All Notifications";

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<NotificationListHeader
				icon={getHeaderIcon(isFavoritesView, isAllView)}
				title={headerTitle}
				unreadCount={unreadCount}
				onMarkAllAsRead={onMarkAllAsRead}
				showIgnored={showIgnored}
				onShowIgnoredChange={setShowIgnored}
				hasIgnored={hasIgnored}
			/>

			{visibleNotifications.length === 0 ? (
				<EmptyState type="no-notifications" />
			) : (
				<div
					ref={scrollContainerRef}
					className="flex-1 overflow-y-auto min-h-0"
				>
					<div className="p-3 space-y-1.5">
						{visibleNotifications.map((notification) => (
							<div
								key={notification.id}
								className={cn(
									deletingIds.has(notification.id) && "notification-deleting",
									notification.ignored && "opacity-50",
								)}
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
