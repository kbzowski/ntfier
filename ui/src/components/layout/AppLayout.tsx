import Bell from "lucide-react/dist/esm/icons/bell";
import { memo, type ReactNode, useCallback, useMemo, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { Subscription } from "@/types/ntfy";
import { Header } from "./Header";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarTopicList } from "./SidebarTopicList";

interface AppLayoutProps {
	children: ReactNode;
	subscriptions: Subscription[];
	selectedTopicId: string | null;
	currentView: "all" | "favorites";
	favoritesCount: number;
	favoritesEnabled: boolean;
	onSelectTopic: (id: string | null) => void;
	onSelectView: (view: "all" | "favorites") => void;
	onToggleMute: (id: string) => void;
	onRemoveSubscription: (id: string) => void;
	onOpenSettings: () => void;
	onAddSubscription: () => void;
}

export const AppLayout = memo(function AppLayout({
	children,
	subscriptions,
	selectedTopicId,
	currentView,
	favoritesCount,
	favoritesEnabled,
	onSelectTopic,
	onSelectView,
	onToggleMute,
	onRemoveSubscription,
	onOpenSettings,
	onAddSubscription,
}: AppLayoutProps) {
	const [drawerOpen, setDrawerOpen] = useState(false);

	const handleSelectTopic = useCallback(
		(id: string | null) => {
			onSelectTopic(id);
			setDrawerOpen(false);
		},
		[onSelectTopic],
	);

	const handleSelectView = useCallback(
		(view: "all" | "favorites") => {
			onSelectView(view);
			setDrawerOpen(false);
		},
		[onSelectView],
	);

	const handleMenuClick = useCallback(() => setDrawerOpen(true), []);

	const totalUnread = useMemo(() => {
		let total = 0;
		for (const s of subscriptions) {
			if (!s.muted) total += s.unreadCount;
		}
		return total;
	}, [subscriptions]);

	return (
		<div className="flex h-screen bg-background">
			<Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
				<SheetContent side="left" className="w-72 p-0 flex flex-col">
					<SheetHeader className="px-4 py-3 border-b border-border">
						<SheetTitle className="flex items-center gap-2 text-left">
							<Bell className="h-5 w-5 text-primary" />
							<span>Subscriptions</span>
						</SheetTitle>
					</SheetHeader>
					<SidebarTopicList
						subscriptions={subscriptions}
						selectedTopicId={selectedTopicId}
						currentView={currentView}
						totalUnread={totalUnread}
						favoritesCount={favoritesCount}
						favoritesEnabled={favoritesEnabled}
						onSelectTopic={handleSelectTopic}
						onSelectView={handleSelectView}
						onToggleMute={onToggleMute}
						onRemove={onRemoveSubscription}
					/>
					<SidebarFooter onAddSubscription={onAddSubscription} />
				</SheetContent>
			</Sheet>

			<main className="flex-1 flex flex-col min-h-0">
				<Header
					totalUnread={totalUnread}
					onMenuClick={handleMenuClick}
					onSettingsClick={onOpenSettings}
				/>

				<div className="relative flex-1 min-h-0">
					<div className="absolute inset-0 overflow-hidden flex flex-col">
						{children}
					</div>
				</div>
			</main>
		</div>
	);
});
