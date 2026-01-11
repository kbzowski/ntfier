import {
	Bell,
	BellOff,
	Hash,
	MoreHorizontal,
	Trash2,
	VolumeX,
} from "lucide-react";
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
	onSelect: () => void;
	onToggleMute: () => void;
	onRemove: () => void;
}

export function SidebarTopicItem({
	subscription,
	isSelected,
	onSelect,
	onToggleMute,
	onRemove,
}: SidebarTopicItemProps) {
	return (
		<button
			type="button"
			className={cn(
				"group flex items-center gap-2 px-3 py-2 mx-2 rounded-md cursor-pointer transition-colors w-full text-left",
				isSelected
					? "bg-sidebar-accent text-sidebar-accent-foreground"
					: "hover:bg-sidebar-accent/50 text-sidebar-foreground",
			)}
			onClick={onSelect}
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
					<DropdownMenuItem onClick={onToggleMute}>
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
						onClick={onRemove}
						className="text-destructive focus:text-destructive"
					>
						<Trash2 className="h-4 w-4 mr-2" />
						Unsubscribe
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</button>
	);
}
