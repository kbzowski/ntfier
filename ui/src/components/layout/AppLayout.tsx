import { Bell } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
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
	onSelectTopic: (id: string | null) => void;
	onToggleMute: (id: string) => void;
	onRemoveSubscription: (id: string) => void;
	onOpenSettings: () => void;
	onAddSubscription: () => void;
}

export function AppLayout({
	children,
	subscriptions,
	selectedTopicId,
	onSelectTopic,
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

	const handleMenuClick = useCallback(() => setDrawerOpen(true), []);

	const totalUnread = subscriptions
		.filter((s) => !s.muted)
		.reduce((sum, s) => sum + s.unreadCount, 0);

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
						onSelectTopic={handleSelectTopic}
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
}
