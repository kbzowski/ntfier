import { ChevronDown, Server } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ServerConfig } from "@/types/ntfy";

interface AddSubscriptionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	servers: ServerConfig[];
	defaultServer: string;
	onAdd: (topic: string, serverUrl: string, displayName?: string) => void;
}

export function AddSubscriptionDialog({
	open,
	onOpenChange,
	servers,
	defaultServer,
	onAdd,
}: AddSubscriptionDialogProps) {
	const [topic, setTopic] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [selectedServer, setSelectedServer] = useState(defaultServer);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!topic.trim()) return;

		onAdd(topic.trim(), selectedServer, displayName.trim() || undefined);

		setTopic("");
		setDisplayName("");
		setSelectedServer(defaultServer);
		onOpenChange(false);
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			setTopic("");
			setDisplayName("");
			setSelectedServer(defaultServer);
		}
		onOpenChange(newOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Subscribe to topic</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="server">Server</Label>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									className="w-full justify-between font-normal"
								>
									<span className="flex items-center gap-2">
										<Server className="h-4 w-4 text-muted-foreground" />
										{selectedServer}
									</span>
									<ChevronDown className="h-4 w-4 text-muted-foreground" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
								{servers.map((server) => (
									<DropdownMenuItem
										key={server.url}
										onClick={() => setSelectedServer(server.url)}
									>
										{server.url}
										{server.isDefault && (
											<span className="ml-auto text-xs text-muted-foreground">
												default
											</span>
										)}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<div className="space-y-2">
						<Label htmlFor="topic">Topic name</Label>
						<Input
							id="topic"
							placeholder="my-topic"
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							autoFocus
						/>
						<p className="text-xs text-muted-foreground">
							The topic name you want to subscribe to (e.g., alerts,
							my-app-notifications)
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="display-name">Display name (optional)</Label>
						<Input
							id="display-name"
							placeholder="My Alerts"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							A friendly name to display in the sidebar
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!topic.trim()}>
							Subscribe
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
