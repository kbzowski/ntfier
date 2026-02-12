import { Inbox } from "lucide-react";
import { memo, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Subscription } from "@/types/ntfy";
import { SidebarTopicItem } from "./SidebarTopicItem";

interface SidebarTopicListProps {
	subscriptions: Subscription[];
	selectedTopicId: string | null;
	onSelectTopic: (id: string | null) => void;
	onToggleMute: (id: string) => void;
	onRemove: (id: string) => void;
}

export const SidebarTopicList = memo(function SidebarTopicList({
	subscriptions,
	selectedTopicId,
	onSelectTopic,
	onToggleMute,
	onRemove,
}: SidebarTopicListProps) {
	const totalUnread = useMemo(
		() =>
			subscriptions
				.filter((s) => !s.muted)
				.reduce((sum, s) => sum + s.unreadCount, 0),
		[subscriptions],
	);

	return (
		<ScrollArea className="flex-1">
			<div className="py-2">
				{/* All Notifications option */}
				<button
					type="button"
					onClick={() => onSelectTopic(null)}
					className={cn(
						"w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
						"hover:bg-accent/50",
						selectedTopicId === null && "bg-accent",
					)}
				>
					<Inbox className="h-4 w-4 text-muted-foreground shrink-0" />
					<span className="flex-1 truncate font-medium">All Notifications</span>
					{totalUnread > 0 && (
						<span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
							{totalUnread > 99 ? "99+" : totalUnread}
						</span>
					)}
				</button>

				{subscriptions.length === 0 ? (
					<div className="px-4 py-8 text-center text-muted-foreground text-sm">
						No subscriptions yet.
						<br />
						Add a topic to get started.
					</div>
				) : (
					subscriptions.map((subscription) => (
						<SidebarTopicItem
							key={subscription.id}
							subscription={subscription}
							isSelected={selectedTopicId === subscription.id}
							onSelect={() => onSelectTopic(subscription.id)}
							onToggleMute={() => onToggleMute(subscription.id)}
							onRemove={() => onRemove(subscription.id)}
						/>
					))
				)}
			</div>
		</ScrollArea>
	);
});
