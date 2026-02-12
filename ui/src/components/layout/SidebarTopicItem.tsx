import Bell from "lucide-react/dist/esm/icons/bell";
import BellOff from "lucide-react/dist/esm/icons/bell-off";
import Hash from "lucide-react/dist/esm/icons/hash";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import VolumeX from "lucide-react/dist/esm/icons/volume-x";
import { memo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

	return (
		<button
			type="button"
			className={cn(
				"group flex items-center gap-2 px-3 py-2 mx-2 rounded-md cursor-pointer transition-colors w-full text-left",
				isSelected
					? "bg-sidebar-accent text-sidebar-accent-foreground"
					: "hover:bg-sidebar-accent/50 text-sidebar-foreground",
			)}
			onClick={handleSelect}
		>
			<Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
			<span className="flex-1 truncate text-sm">
				{subscription.displayName || subscription.topic}
			</span>
			{subscription.muted && (
				<VolumeX className="h-3 w-3 text-muted-foreground shrink-0" />
			)}
			{subscription.unreadCount > 0 && !subscription.muted && (
				<Badge
					variant="default"
					className="h-5 min-w-5 px-1.5 text-xs font-medium shrink-0"
				>
					{subscription.unreadCount > 99 ? "99+" : subscription.unreadCount}
				</Badge>
			)}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
						onClick={(e) => e.stopPropagation()}
					>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={handleToggleMute}>
						{subscription.muted ? (
							<>
								<Bell className="h-4 w-4 mr-2" />
								Unmute
							</>
						) : (
							<>
								<BellOff className="h-4 w-4 mr-2" />
								Mute
							</>
						)}
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
		</button>
	);
});
