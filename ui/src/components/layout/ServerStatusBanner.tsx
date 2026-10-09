import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServerStatus, ServerStatusEntry } from "@/types/bindings";

function describe(status: ServerStatus): string {
	switch (status.kind) {
		case "needsCredentials":
			return "Login rejected: wrong username, password or token";
		case "unsupported":
			return "Server too old (needs ntfy 2.17+)";
		default:
			return "Can't connect";
	}
}

interface ServerStatusBannerProps {
	statuses: ServerStatusEntry[];
	onEditServer: (url: string) => void;
}

/** One line per server the app has stopped connecting to, with a way to fix it. */
export function ServerStatusBanner({
	statuses,
	onEditServer,
}: ServerStatusBannerProps) {
	if (statuses.length === 0) return null;

	return (
		<div
			className="border-b border-destructive/20 bg-destructive/5"
			role="alert"
		>
			{statuses.map(({ url, status }) => (
				<div key={url} className="flex items-center gap-3 px-4 py-2 text-sm">
					<AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
					<span
						className="min-w-0 flex-1 truncate"
						title={"message" in status ? status.message : undefined}
					>
						<span className="font-medium">{url}</span>: {describe(status)}
					</span>
					<Button size="sm" variant="outline" onClick={() => onEditServer(url)}>
						Edit server
					</Button>
				</div>
			))}
		</div>
	);
}
