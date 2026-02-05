import { Hash } from "lucide-react";
import { memo, type ReactNode, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PRIORITY_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Notification as NotificationType } from "@/types/ntfy";
import { MarkdownContent } from "./MarkdownContent";
import { NotificationActions } from "./NotificationActions";
import { NotificationAttachments } from "./NotificationAttachments";
import { NotificationHeader } from "./NotificationHeader";
import { NotificationTags } from "./NotificationTags";

interface NotificationCardProps {
	notification: NotificationType;
	topicName?: string;
	onMarkAsRead?: (id: string) => void;
	isCollapsible?: boolean;
	isExpanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
}

interface CardFrameProps {
	children: ReactNode;
	borderColor: string;
	isUnread: boolean;
	onClick?: () => void;
}

function CardFrame({
	children,
	borderColor,
	isUnread,
	onClick,
}: CardFrameProps) {
	return (
		<Card
			className={cn(
				"transition-colors hover:bg-accent/50 border-l-4",
				borderColor,
				isUnread && "bg-accent/20",
				onClick && "cursor-pointer",
			)}
			onClick={onClick}
		>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

export const NotificationCard = memo(function NotificationCard({
	notification,
	topicName,
	onMarkAsRead,
	isCollapsible = false,
	isExpanded = true,
	onExpandedChange,
}: NotificationCardProps) {
	const borderColor = PRIORITY_CONFIG[notification.priority].borderClass;

	const handleClick = useCallback(() => {
		onMarkAsRead?.(notification.id);
	}, [onMarkAsRead, notification.id]);

	const handleExpandedChange = useCallback(
		(expanded: boolean) => {
			onExpandedChange?.(expanded);
			if (expanded) {
				onMarkAsRead?.(notification.id);
			}
		},
		[onExpandedChange, onMarkAsRead, notification.id],
	);

	const topicBadge = topicName && (
		<div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
			<Hash className="h-3 w-3" />
			<span>{topicName}</span>
		</div>
	);

	const header = (
		<NotificationHeader
			title={notification.title}
			timestamp={notification.timestamp}
			priority={notification.priority}
			read={notification.read}
			showChevron={isCollapsible}
			isExpanded={isExpanded}
		/>
	);

	const details = (
		<>
			{notification.message && (
				<div className="mt-2 text-sm text-muted-foreground selectable">
					<MarkdownContent content={notification.message} />
				</div>
			)}
			<NotificationTags tags={notification.tags} />
			<NotificationAttachments attachments={notification.attachments} />
			<NotificationActions actions={notification.actions} />
		</>
	);

	if (isCollapsible) {
		return (
			<Collapsible open={isExpanded} onOpenChange={handleExpandedChange}>
				<Card
					className={cn(
						"transition-colors hover:bg-accent/50 border-l-4 py-0",
						borderColor,
						!notification.read && "bg-accent/20",
					)}
				>
					<CollapsibleTrigger className="w-full text-left cursor-pointer block px-6 py-4">
						{topicBadge}
						{header}
					</CollapsibleTrigger>
					<CollapsibleContent className="collapsible-content overflow-hidden">
						<div className="px-6 pb-4">{details}</div>
					</CollapsibleContent>
				</Card>
			</Collapsible>
		);
	}

	return (
		<CardFrame
			borderColor={borderColor}
			isUnread={!notification.read}
			onClick={handleClick}
		>
			{topicBadge}
			{header}
			{details}
		</CardFrame>
	);
});
