import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarFooterProps {
	onAddSubscription: () => void;
}

export function SidebarFooter({ onAddSubscription }: SidebarFooterProps) {
	return (
		<div className="p-3 border-t border-sidebar-border">
			<Button
				variant="outline"
				className="w-full justify-start gap-2 bg-sidebar hover:bg-sidebar-accent border-sidebar-border"
				onClick={onAddSubscription}
			>
				<Plus className="h-4 w-4" />
				Subscribe to topic
			</Button>
		</div>
	);
}
