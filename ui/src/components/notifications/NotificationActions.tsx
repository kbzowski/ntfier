import { Copy, ExternalLink, Loader2, Send } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { classifyError } from "@/lib/error-classification";
import { isTauri, notificationsApi } from "@/lib/tauri";
import type { NotificationAction } from "@/types/ntfy";

const ICONS = { view: ExternalLink, http: Send, copy: Copy } as const;

interface NotificationActionsProps {
	notificationId: string;
	actions: NotificationAction[];
}

export const NotificationActions = memo(function NotificationActions({
	notificationId,
	actions,
}: NotificationActionsProps) {
	const [running, setRunning] = useState<ReadonlySet<string>>(new Set());

	const handleClick = useCallback(
		async (e: React.MouseEvent, action: NotificationAction) => {
			e.stopPropagation();
			if (!isTauri()) {
				if (action.action === "view" && action.url) {
					window.open(action.url, "_blank", "noopener,noreferrer");
				}
				return;
			}

			setRunning((prev) => new Set(prev).add(action.id));
			try {
				await notificationsApi.runAction(notificationId, action.id);
				if (action.action === "copy") toast.success("Copied");
			} catch (err) {
				const url = action.action === "view" ? action.url : null;
				toast.error(classifyError(err).userMessage, {
					action: url
						? {
								label: "Copy URL",
								onClick: () => {
									navigator.clipboard.writeText(url);
									toast.success("URL copied to clipboard");
								},
							}
						: undefined,
				});
				console.error("[Action error]", err);
			} finally {
				setRunning((prev) => {
					const next = new Set(prev);
					next.delete(action.id);
					return next;
				});
			}
		},
		[notificationId],
	);

	// broadcast and other types this app can't run are hidden
	const supported = actions.filter((a) => a.action !== "unknown");
	if (supported.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-2 mt-4">
			{supported.map((action) => {
				const Icon = ICONS[(action.action ?? "view") as keyof typeof ICONS];
				return (
					<Button
						key={action.id}
						variant={action.clear ? "ghost" : "outline"}
						size="sm"
						className="h-8 text-xs gap-1.5 transition-all duration-150 hover:bg-accent hover:shadow-sm active:scale-95"
						disabled={running.has(action.id)}
						onClick={(e) => handleClick(e, action)}
					>
						{running.has(action.id) ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<Icon className="h-3 w-3" />
						)}
						{action.label}
					</Button>
				);
			})}
		</div>
	);
});
