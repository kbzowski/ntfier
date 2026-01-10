import { Card, CardContent } from "@/components/ui/card";
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
	onClick?: () => void;
}

export function NotificationCard({
	notification,
	onClick,
}: NotificationCardProps) {
	const borderColor = PRIORITY_CONFIG[notification.priority].borderClass;

	return (
		<Card
			className={cn(
				"cursor-pointer transition-colors hover:bg-accent/50 border-l-4",
				borderColor,
				!notification.read && "bg-accent/20",
			)}
			onClick={onClick}
		>
			<CardContent className="p-4">
				<NotificationHeader
					title={notification.title}
					timestamp={notification.timestamp}
					priority={notification.priority}
					read={notification.read}
				/>
				{notification.message && (
					<div className="mt-2 text-sm text-muted-foreground selectable">
						<MarkdownContent content={notification.message} />
					</div>
				)}
				<NotificationTags tags={notification.tags} />
				<NotificationAttachments attachments={notification.attachments} />
				<NotificationActions actions={notification.actions} />
			</CardContent>
		</Card>
	);
}
