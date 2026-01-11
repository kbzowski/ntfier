import { Minimize2, PanelBottomClose, Power } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface BehaviorTabProps {
	autostart: boolean;
	onAutostartChange: (enabled: boolean) => void;
	minimizeToTray: boolean;
	onMinimizeToTrayChange: (enabled: boolean) => void;
	startMinimized: boolean;
	onStartMinimizedChange: (enabled: boolean) => void;
}

export function BehaviorTab({
	autostart,
	onAutostartChange,
	minimizeToTray,
	onMinimizeToTrayChange,
	startMinimized,
	onStartMinimizedChange,
}: BehaviorTabProps) {
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
		</div>
	);
}
