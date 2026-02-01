import { ChevronRight } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "./PriorityBadge";

interface NotificationHeaderProps {
	title: string;
	timestamp: number;
	priority: number;
	read: boolean;
	showChevron?: boolean;
	isExpanded?: boolean;
}

function formatTimestamp(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;

	return new Date(timestamp).toLocaleDateString();
}

export const NotificationHeader = memo(function NotificationHeader({
	title,
	timestamp,
	priority,
	read,
	showChevron,
	isExpanded,
}: NotificationHeaderProps) {
	return (
		<div className="flex items-start justify-between gap-3">
			<div className="flex items-center gap-2 min-w-0">
				{showChevron && (
					<ChevronRight
						className={cn(
							"h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
							isExpanded && "rotate-90",
						)}
					/>
				)}
				<h3
					className={cn(
						"text-lg truncate transition-all",
						!read ? "font-bold" : "font-semibold",
					)}
				>
					{title}
				</h3>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<PriorityBadge priority={priority} />
				<span className="text-xs text-muted-foreground whitespace-nowrap">
					{formatTimestamp(timestamp)}
				</span>
			</div>
		</div>
	);
});
