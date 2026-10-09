import {
	AlertCircle,
	Eye,
	EyeOff,
	Loader2,
	Pencil,
	RefreshCw,
	Server,
	Trash2,
} from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	type AuthMode,
	type ServerInput,
	useServerForm,
} from "@/hooks/useServerForm";
import { cn } from "@/lib/utils";
import type { ServerConfig } from "@/types/ntfy";

const AUTH_MODES: { id: AuthMode; label: string }[] = [
	{ id: "none", label: "No login" },
	{ id: "password", label: "Username and password" },
	{ id: "token", label: "Access token" },
];

interface ServerConfigFormProps {
	servers: ServerConfig[];
	onAddServer: (server: ServerInput) => Promise<unknown> | undefined;
	onUpdateServer: (server: ServerInput) => Promise<unknown> | undefined;
	onRemoveServer: (url: string) => void;
	onSyncServer: (url: string) => Promise<void>;
	onSetDefault: (url: string) => void;
	/** Opens the form on this server's login, e.g. from a "needs credentials" flag. */
	editUrl?: string | null;
}

export function ServerConfigForm({
	servers,
	onAddServer,
	onUpdateServer,
	onRemoveServer,
	onSyncServer,
	onSetDefault,
	editUrl,
}: ServerConfigFormProps) {
	const [syncing, setSyncing] = useState<string | null>(null);
	const handleSync = async (url: string) => {
		setSyncing(url);
		await onSyncServer(url);
		setSyncing(null);
	};

	const {
		formData,
		setUrl,
		setAuthMode,
		setUsername,
		setPassword,
		setToken,
		showSecret,
		toggleShowSecret,
		isOpen,
		editingUrl,
		startAdding,
		startEditing,
		cancel,
		isLoading,
		error,
		clearError,
		handleSubmit,
		canSubmit,
	} = useServerForm({
		onAdd: async (server) => {
			await onAddServer(server);
		},
		onUpdate: async (server) => {
			await onUpdateServer(server);
		},
		initial: servers.find((s) => s.url === editUrl),
	});

	const secretToggle = (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
			aria-label={showSecret ? "Hide secret" : "Show secret"}
			onClick={toggleShowSecret}
			disabled={isLoading}
		>
			{showSecret ? (
				<EyeOff className="h-4 w-4 text-muted-foreground" />
			) : (
				<Eye className="h-4 w-4 text-muted-foreground" />
			)}
		</Button>
	);

	return (
		<>
			<AlertDialog open={!!error} onOpenChange={clearError}>
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
								{(server.username || server.token) && (
									<span className="text-xs text-muted-foreground">
										{server.username ?? "Access token"}
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
								{(server.username || server.token) && (
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										aria-label={`Sync topics with the account on ${server.url}`}
										disabled={syncing === server.url}
										onClick={() => handleSync(server.url)}
									>
										<RefreshCw
											className={cn(
												"h-4 w-4",
												syncing === server.url && "animate-spin",
											)}
										/>
									</Button>
								)}
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									aria-label={`Edit login for ${server.url}`}
									onClick={() => startEditing(server)}
								>
									<Pencil className="h-4 w-4" />
								</Button>
								{servers.length > 1 && (
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8 text-destructive hover:text-destructive"
										aria-label={`Remove server ${server.url}`}
										onClick={() => onRemoveServer(server.url)}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								)}
							</div>
						</div>
					))}
				</div>

				{isOpen ? (
					<form
						className="space-y-3 p-4 rounded-lg border border-border"
						onSubmit={(e) => {
							e.preventDefault();
							handleSubmit();
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="server-url">Server URL</Label>
							<Input
								id="server-url"
								placeholder="https://ntfy.sh"
								value={formData.url}
								onChange={(e) => setUrl(e.target.value)}
								disabled={isLoading || !!editingUrl}
							/>
						</div>

						<RadioGroup
							value={formData.authMode}
							onValueChange={(value) => setAuthMode(value as AuthMode)}
							className="space-y-1"
							aria-label="Login"
						>
							{AUTH_MODES.map((mode) => (
								<div key={mode.id} className="flex items-center gap-2">
									<RadioGroupItem value={mode.id} id={`auth-${mode.id}`} />
									<Label htmlFor={`auth-${mode.id}`} className="font-normal">
										{mode.label}
									</Label>
								</div>
							))}
						</RadioGroup>

						{formData.authMode === "password" && (
							<>
								<div className="space-y-2">
									<Label htmlFor="server-username">Username</Label>
									<Input
										id="server-username"
										placeholder="username"
										value={formData.username}
										onChange={(e) => setUsername(e.target.value)}
										disabled={isLoading}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="server-password">Password</Label>
									<div className="relative">
										<Input
											id="server-password"
											type={showSecret ? "text" : "password"}
											placeholder="password"
											value={formData.password}
											onChange={(e) => setPassword(e.target.value)}
											disabled={isLoading}
										/>
										{secretToggle}
									</div>
								</div>
							</>
						)}

						{formData.authMode === "token" && (
							<div className="space-y-2">
								<Label htmlFor="server-token">Access token</Label>
								<div className="relative">
									<Input
										id="server-token"
										type={showSecret ? "text" : "password"}
										placeholder="tk_..."
										value={formData.token}
										onChange={(e) => setToken(e.target.value)}
										disabled={isLoading}
									/>
									{secretToggle}
								</div>
							</div>
						)}

						<div className="flex gap-2 pt-2">
							<Button type="submit" disabled={!canSubmit}>
								{isLoading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Connecting...
									</>
								) : editingUrl ? (
									"Save"
								) : (
									"Add Server"
								)}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={cancel}
								disabled={isLoading}
							>
								Cancel
							</Button>
						</div>
					</form>
				) : (
					<Button variant="outline" className="w-full" onClick={startAdding}>
						Add Server
					</Button>
				)}
			</div>
		</>
	);
}
