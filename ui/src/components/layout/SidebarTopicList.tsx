import { ScrollArea } from "@/components/ui/scroll-area";
import type { Subscription } from "@/types/ntfy";
import { SidebarTopicItem } from "./SidebarTopicItem";

interface SidebarTopicListProps {
	subscriptions: Subscription[];
	selectedTopicId: string | null;
	onSelectTopic: (id: string) => void;
	onToggleMute: (id: string) => void;
	onRemove: (id: string) => void;
}

export function SidebarTopicList({
	subscriptions,
	selectedTopicId,
	onSelectTopic,
	onToggleMute,
	onRemove,
}: SidebarTopicListProps) {
	return (
		<ScrollArea className="flex-1">
			<div className="py-2">
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
}
