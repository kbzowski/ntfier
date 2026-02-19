import Inbox from "lucide-react/dist/esm/icons/inbox";
import Star from "lucide-react/dist/esm/icons/star";
import { memo, type ReactNode, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Subscription } from "@/types/ntfy";
import { SidebarTopicItem } from "./SidebarTopicItem";

const EMPTY_STATE = (
	<div className="px-4 py-8 text-center text-muted-foreground text-sm">
		No subscriptions yet.
		<br />
		Add a topic to get started.
	</div>
);

interface SidebarNavItemProps {
	icon: ReactNode;
	label: string;
	isActive: boolean;
	badge?: number;
	onClick: () => void;
}

const SidebarNavItem = memo(function SidebarNavItem({
	icon,
	label,
	isActive,
	badge,
	onClick,
}: SidebarNavItemProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
				"hover:bg-accent/50",
				isActive && "bg-accent",
			)}
		>
			{icon}
			<span className="flex-1 truncate font-medium">{label}</span>
			{badge != null && badge > 0 ? (
				<span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
					{badge > 99 ? "99+" : badge}
				</span>
			) : null}
		</button>
	);
});

interface SidebarTopicListProps {
	subscriptions: Subscription[];
	selectedTopicId: string | null;
	currentView: "all" | "favorites";
	totalUnread: number;
	favoritesCount: number;
	favoritesEnabled: boolean;
	onSelectTopic: (id: string | null) => void;
	onSelectView: (view: "all" | "favorites") => void;
	onToggleMute: (id: string) => void;
	onRemove: (id: string) => void;
}

export const SidebarTopicList = memo(function SidebarTopicList({
	subscriptions,
	selectedTopicId,
	currentView,
	totalUnread,
	favoritesCount,
	favoritesEnabled,
	onSelectTopic,
	onSelectView,
	onToggleMute,
	onRemove,
}: SidebarTopicListProps) {
	const handleSelectAll = useCallback(() => {
		onSelectView("all");
		onSelectTopic(null);
	}, [onSelectView, onSelectTopic]);

	const handleSelectFavorites = useCallback(() => {
		onSelectView("favorites");
		onSelectTopic(null);
	}, [onSelectView, onSelectTopic]);

	const handleSelectTopic = useCallback(
		(id: string) => {
			onSelectView("all");
			onSelectTopic(id);
		},
		[onSelectView, onSelectTopic],
	);

	return (
		<ScrollArea className="flex-1">
			<div className="py-2">
				<SidebarNavItem
					icon={<Inbox className="h-4 w-4 text-muted-foreground shrink-0" />}
					label="All Notifications"
					isActive={currentView === "all" && selectedTopicId === null}
					badge={totalUnread}
					onClick={handleSelectAll}
				/>

				{favoritesEnabled ? (
					<SidebarNavItem
						icon={<Star className="h-4 w-4 text-yellow-500 shrink-0" />}
						label="Favorites"
						isActive={currentView === "favorites"}
						badge={favoritesCount}
						onClick={handleSelectFavorites}
					/>
				) : null}

				{subscriptions.length === 0
					? EMPTY_STATE
					: subscriptions.map((subscription) => (
							<SidebarTopicItem
								key={subscription.id}
								subscription={subscription}
								isSelected={
									currentView === "all" && selectedTopicId === subscription.id
								}
								onSelect={handleSelectTopic}
								onToggleMute={onToggleMute}
								onRemove={onRemove}
							/>
						))}
			</div>
		</ScrollArea>
	);
});
