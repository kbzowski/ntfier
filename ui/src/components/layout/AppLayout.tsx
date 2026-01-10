import { Bell, Menu } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Subscription } from "@/types/ntfy";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarTopicList } from "./SidebarTopicList";

interface AppLayoutProps {
	children: ReactNode;
	subscriptions: Subscription[];
	selectedTopicId: string | null;
	onSelectTopic: (id: string) => void;
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

	const handleSelectTopic = (id: string) => {
		onSelectTopic(id);
		setDrawerOpen(false);
	};

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
				<header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-9 w-9 relative"
									onClick={() => setDrawerOpen(true)}
								>
									<Menu className="h-5 w-5" />
									{totalUnread > 0 && (
										<span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] font-medium bg-primary text-primary-foreground rounded-full flex items-center justify-center">
											{totalUnread > 99 ? "99+" : totalUnread}
										</span>
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p>Open subscriptions</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<div className="flex items-center gap-2">
						<Bell className="h-5 w-5 text-muted-foreground" />
						<span className="font-semibold">Ntfier</span>
					</div>

					<div className="flex-1" />

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="gap-2"
									onClick={onOpenSettings}
								>
									Settings
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p>Open settings</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</header>

				<div className="relative flex-1 min-h-0">
					<div className="absolute inset-0 overflow-hidden flex flex-col">{children}</div>
				</div>
			</main>
		</div>
	);
}
