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
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface RetentionFieldProps {
	id: string;
	label: string;
	unit: string;
	value: number | null;
	onChange: (value: number | null) => void;
}

/** A retention limit: empty = off, only positive integers; turning it on asks for confirmation. */
function RetentionField({
	id,
	label,
	unit,
	value,
	onChange,
}: RetentionFieldProps) {
	const [draft, setDraft] = useState(value?.toString() ?? "");
	const [pending, setPending] = useState<number | null>(null);
	const confirmed = useRef(false);

	useEffect(() => setDraft(value?.toString() ?? ""), [value]);

	const commit = () => {
		const text = draft.trim();
		// 9 digits keeps the value inside the backend's u32
		const next =
			/^\d{1,9}$/.test(text) && Number(text) > 0 ? Number(text) : null;
		if ((text !== "" && next === null) || next === value) {
			setDraft(value?.toString() ?? "");
		} else if (value === null) {
			setPending(next);
		} else {
			onChange(next);
		}
	};

	return (
		<div className="pt-2">
			<div className="flex items-center gap-2 pl-6 text-sm">
				<label htmlFor={id} className="font-medium">
					{label}
				</label>
				<Input
					id={id}
					inputMode="numeric"
					placeholder="off"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
					className="h-8 w-20"
				/>
				<span className="text-muted-foreground">{unit}</span>
			</div>
			<p className="text-xs text-muted-foreground pl-6 mt-1">
				Removed only from this device; favorites are kept. Leave empty to turn
				off
			</p>
			<ConfirmDialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPending(null);
						if (!confirmed.current) setDraft(value?.toString() ?? "");
						confirmed.current = false;
					}
				}}
				title="Turn on retention?"
				description="Notifications past this limit will be removed for good. Favorites are kept."
				confirmLabel="Turn on"
				variant="destructive"
				onConfirm={() => {
					// Closing follows confirm; keep the entered value instead of reverting
					confirmed.current = true;
					onChange(pending);
				}}
			/>
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
	retentionMaxAgeDays: number | null;
	onRetentionMaxAgeDaysChange: (days: number | null) => void;
	retentionMaxPerSubscription: number | null;
	onRetentionMaxPerSubscriptionChange: (max: number | null) => void;
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
	retentionMaxAgeDays,
	onRetentionMaxAgeDaysChange,
	retentionMaxPerSubscription,
	onRetentionMaxPerSubscriptionChange,
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

			<RetentionField
				id="retention-max-age-days"
				label="Remove notifications older than"
				unit="days"
				value={retentionMaxAgeDays}
				onChange={onRetentionMaxAgeDaysChange}
			/>

			<RetentionField
				id="retention-max-per-subscription"
				label="Keep at most"
				unit="notifications per subscription"
				value={retentionMaxPerSubscription}
				onChange={onRetentionMaxPerSubscriptionChange}
			/>

			<Separator className="my-4" />

			<UpdateSection
				updateInfo={updateInfo}
				onUpdateInfoChange={onUpdateInfoChange}
			/>
		</div>
	);
}
