import { AlertCircle, Eye, EyeOff, Loader2, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ServerConfig } from "@/types/ntfy";

interface ServerConfigFormProps {
	servers: ServerConfig[];
	onAddServer: (
		server: Omit<ServerConfig, "isDefault">,
	) => Promise<unknown> | void;
	onRemoveServer: (url: string) => void;
	onSetDefault: (url: string) => void;
}

export function ServerConfigForm({
	servers,
	onAddServer,
	onRemoveServer,
	onSetDefault,
}: ServerConfigFormProps) {
	const [url, setUrl] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isAdding, setIsAdding] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleAdd = async () => {
		if (!url.trim()) return;

		setIsLoading(true);
		setError(null);

		try {
			await onAddServer({
				url: url.trim(),
				username: username.trim() || undefined,
				password: password || undefined,
			});

			setUrl("");
			setUsername("");
			setPassword("");
			setIsAdding(false);
		} catch (err) {
			console.error("Failed to add server:", err);
			const message =
				err instanceof Error
					? err.message
					: typeof err === "string"
						? err
						: "Failed to connect to server";
			setError(message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			<AlertDialog open={!!error} onOpenChange={() => setError(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertCircle className="h-5 w-5 text-destructive" />
							Connection Error
						</AlertDialogTitle>
						<AlertDialogDescription className="text-left">
							{error}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction>OK</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<div className="space-y-4">
				<div className="space-y-3">
					{servers.map((server) => (
						<div
							key={server.url}
							className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
						>
							<Server className="h-5 w-5 text-muted-foreground shrink-0" />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium truncate">
										{server.url}
									</span>
									{server.isDefault && (
										<Badge variant="secondary" className="text-xs">
											Default
										</Badge>
									)}
								</div>
								{server.username && (
									<span className="text-xs text-muted-foreground">
										{server.username}
									</span>
								)}
							</div>
							<div className="flex items-center gap-1 shrink-0">
								{!server.isDefault && (
									<Button
										variant="ghost"
										size="sm"
										className="text-xs"
										onClick={() => onSetDefault(server.url)}
									>
										Set default
									</Button>
								)}
								{servers.length > 1 && (
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8 text-destructive hover:text-destructive"
										onClick={() => onRemoveServer(server.url)}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								)}
							</div>
						</div>
					))}
				</div>

				{isAdding ? (
					<div className="space-y-3 p-4 rounded-lg border border-border">
						<div className="space-y-2">
							<Label htmlFor="server-url">Server URL</Label>
							<Input
								id="server-url"
								placeholder="https://ntfy.sh"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								disabled={isLoading}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="server-username">Username (optional)</Label>
							<Input
								id="server-username"
								placeholder="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								disabled={isLoading}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="server-password">Password (optional)</Label>
							<div className="relative">
								<Input
									id="server-password"
									type={showPassword ? "text" : "password"}
									placeholder="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={isLoading}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
									onClick={() => setShowPassword(!showPassword)}
									disabled={isLoading}
								>
									{showPassword ? (
										<EyeOff className="h-4 w-4 text-muted-foreground" />
									) : (
										<Eye className="h-4 w-4 text-muted-foreground" />
									)}
								</Button>
							</div>
						</div>
						<div className="flex gap-2 pt-2">
							<Button
								onClick={handleAdd}
								disabled={!url.trim() || isLoading}
							>
								{isLoading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Connecting...
									</>
								) : (
									"Add Server"
								)}
							</Button>
							<Button
								variant="ghost"
								onClick={() => setIsAdding(false)}
								disabled={isLoading}
							>
								Cancel
							</Button>
						</div>
					</div>
				) : (
					<Button
						variant="outline"
						className="w-full"
						onClick={() => setIsAdding(true)}
					>
						Add Server
					</Button>
				)}
			</div>
		</>
	);
}
