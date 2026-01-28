import {
	CheckCircle2,
	Download,
	Loader2,
	Minimize2,
	PanelBottomClose,
	Power,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { isTauri, type UpdateInfo, updateApi } from "@/lib/tauri";

type UpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "up-to-date"
	| "installing"
	| "error";

interface BehaviorTabProps {
	autostart: boolean;
	onAutostartChange: (enabled: boolean) => void;
	minimizeToTray: boolean;
	onMinimizeToTrayChange: (enabled: boolean) => void;
	startMinimized: boolean;
	onStartMinimizedChange: (enabled: boolean) => void;
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
	updateInfo,
	onUpdateInfoChange,
}: BehaviorTabProps) {
	const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(
		updateInfo ? "available" : "idle",
	);
	const [error, setError] = useState<string | null>(null);

	const handleCheckForUpdates = async () => {
		if (!isTauri()) return;

		setUpdateStatus("checking");
		setError(null);

		try {
			const info = await updateApi.checkForUpdate();
			if (info) {
				onUpdateInfoChange(info);
				setUpdateStatus("available");
			} else {
				onUpdateInfoChange(null);
				setUpdateStatus("up-to-date");
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to check for updates",
			);
			setUpdateStatus("error");
		}
	};

	const handleInstallUpdate = async () => {
		if (!isTauri()) return;

		setUpdateStatus("installing");
		setError(null);

		try {
			await updateApi.installUpdate();
			// The app will restart after installation
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to install update");
			setUpdateStatus("error");
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<Checkbox
					id="autostart"
					checked={autostart}
					onCheckedChange={(checked) => onAutostartChange(checked === true)}
				/>
				<label
					htmlFor="autostart"
					className="flex items-center gap-2 text-sm font-medium cursor-pointer"
				>
					<Power className="h-4 w-4 text-muted-foreground" />
					Start with system
				</label>
			</div>
			<p className="text-xs text-muted-foreground pl-6">
				Automatically start Ntfier when you log in to your computer
			</p>

			<div className="flex items-center gap-2 pt-2">
				<Checkbox
					id="minimize-to-tray"
					checked={minimizeToTray}
					onCheckedChange={(checked) =>
						onMinimizeToTrayChange(checked === true)
					}
				/>
				<label
					htmlFor="minimize-to-tray"
					className="flex items-center gap-2 text-sm font-medium cursor-pointer"
				>
					<PanelBottomClose className="h-4 w-4 text-muted-foreground" />
					Minimize to system tray
				</label>
			</div>
			<p className="text-xs text-muted-foreground pl-6">
				When closing the window, minimize to system tray instead of quitting
			</p>

			<div className="flex items-center gap-2 pt-2">
				<Checkbox
					id="start-minimized"
					checked={startMinimized}
					onCheckedChange={(checked) =>
						onStartMinimizedChange(checked === true)
					}
				/>
				<label
					htmlFor="start-minimized"
					className="flex items-center gap-2 text-sm font-medium cursor-pointer"
				>
					<Minimize2 className="h-4 w-4 text-muted-foreground" />
					Start minimized
				</label>
			</div>
			<p className="text-xs text-muted-foreground pl-6">
				Start the application minimized to system tray
			</p>

			<Separator className="my-4" />

			{/* Updates Section */}
			<div className="space-y-3">
				<h4 className="text-sm font-medium">Updates</h4>

				{(updateStatus === "available" || updateStatus === "installing") &&
				updateInfo && (
					<div className="rounded-md border p-3 space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">
								Version {updateInfo.version} available
							</span>
							<Button
								size="sm"
								onClick={handleInstallUpdate}
								disabled={updateStatus === "installing"}
							>
								{updateStatus === "installing" ? (
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

				{updateStatus === "up-to-date" && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<CheckCircle2 className="h-4 w-4 text-green-500" />
						You're running the latest version
					</div>
				)}

				{error && <p className="text-sm text-destructive">{error}</p>}

				{(updateStatus === "idle" ||
					updateStatus === "checking" ||
					updateStatus === "up-to-date" ||
					updateStatus === "error") && (
					<Button
						variant="outline"
						size="sm"
						onClick={handleCheckForUpdates}
						disabled={updateStatus === "checking"}
					>
						{updateStatus === "checking" ? (
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
		</div>
	);
}
