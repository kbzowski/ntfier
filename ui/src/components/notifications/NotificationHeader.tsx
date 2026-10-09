import { ChevronRight, ExternalLink, Star, Trash2 } from "lucide-react";
import { type MouseEvent, memo, useState } from "react";
import { toast } from "sonner";
import { useShowImages } from "@/context/ShowImagesContext";
import { classifyError } from "@/lib/error-classification";
import { isTauri, notificationsApi } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "./PriorityBadge";
import { RelativeTime } from "./RelativeTime";

const APP_ICON = "/logo192.png";

interface NotificationHeaderProps {
	title: string;
	/** Remote image the publisher set as the message's icon. */
	icon?: string | null;
	/** URL the publisher wants opened when the message is clicked. */
	click?: string | null;
	timestamp: number;
	priority: number;
	read: boolean;
	showChevron?: boolean;
	isExpanded?: boolean;
	isFavorite?: boolean;
	onToggleFavorite?: () => void;
	onDelete?: () => void;
}

function MessageIcon({ url }: { url: string }) {
	const showImages = useShowImages();
	const [failed, setFailed] = useState(false);
	return (
		<img
			src={showImages && !failed ? url : APP_ICON}
			alt=""
			className="h-5 w-5 shrink-0 rounded-sm object-cover"
			onError={() => setFailed(true)}
		/>
	);
}

export const NotificationHeader = memo(function NotificationHeader({
	title,
	icon,
	click,
	timestamp,
	priority,
	read,
	showChevron,
	isExpanded,
	isFavorite,
	onToggleFavorite,
	onDelete,
}: NotificationHeaderProps) {
	const handleDelete = (e: MouseEvent) => {
		e.stopPropagation();
		onDelete?.();
	};

	const handleOpenClick = (e: MouseEvent) => {
		e.stopPropagation();
		if (!click) return;
		if (isTauri()) {
			notificationsApi
				.openUrl(click)
				.catch((err) => toast.error(classifyError(err).userMessage));
		} else {
			window.open(click, "_blank", "noopener,noreferrer");
		}
	};

	const handleToggleFavorite = (e: MouseEvent) => {
		e.stopPropagation();
		onToggleFavorite?.();
	};

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
				{icon && <MessageIcon url={icon} />}
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
				{click && (
					<button
						type="button"
						aria-label="Open link"
						title={click}
						onClick={handleOpenClick}
						className="p-1 rounded-sm text-muted-foreground hover:text-foreground"
					>
						<ExternalLink className="h-4 w-4" />
					</button>
				)}
				{onToggleFavorite && (
					<button
						type="button"
						aria-label={
							isFavorite ? "Remove from favorites" : "Add to favorites"
						}
						onClick={handleToggleFavorite}
						className={cn(
							"p-1 rounded-sm transition-opacity",
							isFavorite
								? "text-yellow-500 opacity-100"
								: "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-500",
						)}
					>
						<Star className={cn("h-4 w-4", isFavorite && "fill-current")} />
					</button>
				)}
				{onDelete && (
					<button
						type="button"
						aria-label="Delete notification"
						onClick={handleDelete}
						className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
					>
						<Trash2 className="h-4 w-4" />
					</button>
				)}
				<PriorityBadge priority={priority} />
				<RelativeTime
					timestamp={timestamp}
					className="text-xs text-muted-foreground whitespace-nowrap"
				/>
			</div>
		</div>
	);
});
