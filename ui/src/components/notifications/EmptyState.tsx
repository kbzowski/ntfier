import { Bell, Inbox } from "lucide-react";

interface EmptyStateProps {
	type: "no-topic" | "no-notifications";
}

export function EmptyState({ type }: EmptyStateProps) {
	if (type === "no-topic") {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
				<Bell className="h-16 w-16 text-muted-foreground/30 mb-4" />
				<h2 className="text-xl font-semibold text-foreground mb-2">
					Welcome to ntfy
				</h2>
				<p className="text-muted-foreground max-w-md">
					Select a topic from the sidebar to view notifications, or subscribe to
					a new topic to get started.
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
			<Inbox className="h-16 w-16 text-muted-foreground/30 mb-4" />
			<h2 className="text-xl font-semibold text-foreground mb-2">
				No notifications yet
			</h2>
			<p className="text-muted-foreground max-w-md">
				When this topic receives notifications, they will appear here.
			</p>
		</div>
	);
}
