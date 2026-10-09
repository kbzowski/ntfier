import {
	Bell,
	BellOff,
	Hash,
	MoreHorizontal,
	Trash2,
	VolumeX,
} from "lucide-react";
import { memo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Subscription } from "@/types/ntfy";

interface SidebarTopicItemProps {
	subscription: Subscription;
	isSelected: boolean;
	onSelect: (id: string) => void;
	onToggleMute: (id: string) => void;
	onRemove: (id: string) => void;
}

export const SidebarTopicItem = memo(function SidebarTopicItem({
	subscription,
	isSelected,
	onSelect,
	onToggleMute,
	onRemove,
}: SidebarTopicItemProps) {
	const handleSelect = useCallback(
		() => onSelect(subscription.id),
		[onSelect, subscription.id],
	);
	const handleToggleMute = useCallback(
		() => onToggleMute(subscription.id),
		[onToggleMute, subscription.id],
	);
	const handleRemove = useCallback(
		() => onRemove(subscription.id),
		[onRemove, subscription.id],
	);

	const muteLabel = subscription.muted ? "Unmute" : "Mute";
	const MuteIcon = subscription.muted ? Bell : BellOff;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={cn(
						"group flex items-center gap-1 pr-1 mx-2 rounded-md transition-colors",
						isSelected
							? "bg-sidebar-accent text-sidebar-accent-foreground"
							: "hover:bg-sidebar-accent/50 text-sidebar-foreground",
					)}
				>
					<button
						type="button"
						className="flex flex-1 min-w-0 items-center gap-2 pl-3 py-2 cursor-pointer text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={handleSelect}
						aria-current={isSelected ? "page" : undefined}
					>
						<Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="flex-1 truncate text-sm">
							{subscription.displayName || subscription.topic}
						</span>
						{subscription.muted && (
							<VolumeX
								className="h-3 w-3 text-muted-foreground shrink-0"
								aria-label="Muted"
							/>
						)}
						{subscription.unreadCount > 0 && !subscription.muted && (
							<Badge
								variant="default"
								className="h-5 min-w-5 px-1.5 text-xs font-medium shrink-0"
							>
								{subscription.unreadCount > 99
									? "99+"
									: subscription.unreadCount}
							</Badge>
						)}
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Topic options"
								className={cn(
									"h-6 w-6 shrink-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
									isSelected ? "opacity-100" : "opacity-0",
								)}
							>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleToggleMute}>
								<MuteIcon className="h-4 w-4 mr-2" />
								{muteLabel}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleRemove}
								className="text-destructive focus:text-destructive"
							>
								<Trash2 className="h-4 w-4 mr-2" />
								Unsubscribe
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onClick={handleToggleMute}>
					<MuteIcon />
					{muteLabel}
				</ContextMenuItem>
				<ContextMenuItem variant="destructive" onClick={handleRemove}>
					<Trash2 />
					Unsubscribe
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
});
