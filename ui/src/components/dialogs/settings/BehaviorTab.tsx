import {
	CheckCircle2,
	Download,
	Loader2,
	Minimize2,
	PanelBottomClose,
	Power,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SettingCheckbox } from "@/components/ui/setting-checkbox";
import { isTauri, type UpdateInfo, updateApi } from "@/lib/tauri";

type UpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "up-to-date"
	| "installing"
	| "error";

interface UpdateSectionProps {
	updateInfo: UpdateInfo | null;
	onUpdateInfoChange: (info: UpdateInfo | null) => void;
}

function UpdateSection({ updateInfo, onUpdateInfoChange }: UpdateSectionProps) {
	const [status, setStatus] = useState<UpdateStatus>(
		updateInfo ? "available" : "idle",
	);
	const [error, setError] = useState<string | null>(null);

	const handleCheck = async () => {
		if (!isTauri()) return;

		setStatus("checking");
		setError(null);

		try {
			const info = await updateApi.checkForUpdate();
			if (info) {
				onUpdateInfoChange(info);
				setStatus("available");
			} else {
				onUpdateInfoChange(null);
				setStatus("up-to-date");
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to check for updates",
			);
			setStatus("error");
		}
	};

	const handleInstall = async () => {
		if (!isTauri()) return;

		setStatus("installing");
		setError(null);

		try {
			await updateApi.installUpdate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to install update");
			setStatus("error");
		}
	};

	const showCheckButton =
		status === "idle" ||
		status === "checking" ||
		status === "up-to-date" ||
		status === "error";

	return (
		<div className="space-y-3">
			<h4 className="text-sm font-medium">Updates</h4>

			{(status === "available" || status === "installing") && updateInfo && (
				<div className="rounded-md border p-3 space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">
							Version {updateInfo.version} available
						</span>
						<Button
							size="sm"
							onClick={handleInstall}
							disabled={status === "installing"}
						>
							{status === "installing" ? (
								<>
									<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
									Installing...
								</>
							) : (
								<>
									<Download className="h-4 w-4 mr-1.5" />
									Install & Restart
								</>
							)}
						</Button>
					</div>
					{updateInfo.body && (
						<p className="text-xs text-muted-foreground whitespace-pre-wrap">
							{updateInfo.body}
						</p>
					)}
				</div>
			)}

			{status === "up-to-date" && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<CheckCircle2 className="h-4 w-4 text-green-500" />
					You're running the latest version
				</div>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}

			{showCheckButton && (
				<Button
					variant="outline"
					size="sm"
					onClick={handleCheck}
					disabled={status === "checking"}
				>
					{status === "checking" ? (
						<>
							<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
							Checking...
						</>
					) : (
						<>
							<RefreshCw className="h-4 w-4 mr-1.5" />
							Check for Updates
						</>
					)}
				</Button>
			)}
		</div>
	);
}

interface BehaviorTabProps {
	autostart: boolean;
	onAutostartChange: (enabled: boolean) => void;
	minimizeToTray: boolean;
	onMinimizeToTrayChange: (enabled: boolean) => void;
	startMinimized: boolean;
	onStartMinimizedChange: (enabled: boolean) => void;
	deleteLocalOnly: boolean;
	onDeleteLocalOnlyChange: (enabled: boolean) => void;
	updateInfo: UpdateInfo | null;
	onUpdateInfoChange: (info: UpdateInfo | null) => void;
}

export function BehaviorTab({
	autostart,
	onAutostartChange,
	minimizeToTray,
	onMinimizeToTrayChange,
	startMinimized,
	onStartMinimizedChange,
	deleteLocalOnly,
	onDeleteLocalOnlyChange,
	updateInfo,
	onUpdateInfoChange,
}: BehaviorTabProps) {
	return (
		<div className="space-y-4">
			<SettingCheckbox
				id="autostart"
				checked={autostart}
				onCheckedChange={onAutostartChange}
				label="Start with system"
				icon={<Power className="h-4 w-4 text-muted-foreground" />}
				description="Automatically start Ntfier when you log in to your computer"
			/>

			<SettingCheckbox
				id="minimize-to-tray"
				checked={minimizeToTray}
				onCheckedChange={onMinimizeToTrayChange}
				label="Minimize to system tray"
				icon={<PanelBottomClose className="h-4 w-4 text-muted-foreground" />}
				description="When closing or minimizing the window, hide to system tray instead of quitting"
				className="pt-2"
			/>

			<SettingCheckbox
				id="start-minimized"
				checked={startMinimized}
				onCheckedChange={onStartMinimizedChange}
				label="Start minimized"
				icon={<Minimize2 className="h-4 w-4 text-muted-foreground" />}
				description="Start the application minimized to system tray"
				className="pt-2"
			/>

			<SettingCheckbox
				id="delete-local-only"
				checked={deleteLocalOnly}
				onCheckedChange={onDeleteLocalOnlyChange}
				label="Delete only locally"
				icon={<Trash2 className="h-4 w-4 text-muted-foreground" />}
				description="When disabled, deleting a notification also removes it from the ntfy server"
				className="pt-2"
			/>

			<Separator className="my-4" />

			<UpdateSection
				updateInfo={updateInfo}
				onUpdateInfoChange={onUpdateInfoChange}
			/>
		</div>
	);
}
