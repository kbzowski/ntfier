import Bell from "lucide-react/dist/esm/icons/bell";
import Menu from "lucide-react/dist/esm/icons/menu";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface HeaderProps {
	totalUnread: number;
	onMenuClick: () => void;
	onSettingsClick: () => void;
}

export const Header = memo(function Header({
	totalUnread,
	onMenuClick,
	onSettingsClick,
}: HeaderProps) {
	return (
		<header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9 relative"
							onClick={onMenuClick}
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
							onClick={onSettingsClick}
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
	);
});
