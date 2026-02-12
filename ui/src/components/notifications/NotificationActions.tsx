import { open } from "@tauri-apps/plugin-shell";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import { memo, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { classifyError } from "@/lib/error-classification";
import { isTauri } from "@/lib/tauri";
import type { NotificationAction } from "@/types/ntfy";

interface NotificationActionsProps {
	actions: NotificationAction[];
}

export const NotificationActions = memo(function NotificationActions({
	actions,
}: NotificationActionsProps) {
	const handleClick = useCallback(
		async (e: React.MouseEvent, action: NotificationAction) => {
			e.stopPropagation();
			if (!action.url) return;

			try {
				if (isTauri()) {
					await open(action.url);
				} else {
					window.open(action.url, "_blank", "noopener,noreferrer");
				}
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Failed to open URL",
					action: {
						label: "Copy URL",
						onClick: () => {
							if (action.url) {
								navigator.clipboard.writeText(action.url);
								toast.success("URL copied to clipboard");
							}
						},
					},
				});
				console.error("[Open URL error]", err);
			}
		},
		[],
	);

	if (actions.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-2 mt-4">
			{actions.map((action) => (
				<Button
					key={action.id}
					variant={action.clear ? "ghost" : "outline"}
					size="sm"
					className="h-8 text-xs gap-1.5 transition-all duration-150 hover:bg-accent hover:shadow-sm active:scale-95"
					onClick={(e) => handleClick(e, action)}
				>
					{action.url && <ExternalLink className="h-3 w-3" />}
					{action.label}
				</Button>
			))}
		</div>
	);
});
