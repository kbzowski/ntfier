import { open } from "@tauri-apps/plugin-shell";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/tauri";
import type { NotificationAction } from "@/types/ntfy";

interface NotificationActionsProps {
	actions: NotificationAction[];
}

export function NotificationActions({ actions }: NotificationActionsProps) {
	if (actions.length === 0) return null;

	const handleClick = async (action: NotificationAction) => {
		if (!action.url) return;

		try {
			if (isTauri()) {
				await open(action.url);
			} else {
				window.open(action.url, "_blank", "noopener,noreferrer");
			}
		} catch (err) {
			console.error("Failed to open URL:", err);
		}
	};

	return (
		<div className="flex flex-wrap gap-2 mt-4">
			{actions.map((action) => (
				<Button
					key={action.id}
					variant={action.clear ? "ghost" : "outline"}
					size="sm"
					className="h-8 text-xs gap-1.5 transition-all duration-150 hover:bg-accent hover:shadow-sm active:scale-95"
					onClick={() => handleClick(action)}
				>
					{action.url && <ExternalLink className="h-3 w-3" />}
					{action.label}
				</Button>
			))}
		</div>
	);
}
