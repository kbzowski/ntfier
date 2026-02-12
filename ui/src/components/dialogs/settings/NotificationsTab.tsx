import Bell from "lucide-react/dist/esm/icons/bell";
import Monitor from "lucide-react/dist/esm/icons/monitor";
import Volume2 from "lucide-react/dist/esm/icons/volume-2";
import Zap from "lucide-react/dist/esm/icons/zap";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { SettingCheckbox } from "@/components/ui/setting-checkbox";
import type { NotificationDisplayMethod } from "@/types/bindings";

const NOTIFICATION_METHODS: {
	id: NotificationDisplayMethod;
	label: string;
	description: string;
	icon: typeof Bell;
	windowsOnly?: boolean;
}[] = [
	{
		id: "native",
		label: "Native",
		description:
			"Standard Windows notifications (may be suppressed by Focus Assist)",
		icon: Monitor,
	},
	{
		id: "windows_enhanced",
		label: "Windows Enhanced",
		description:
			"Rich notifications with actions, images, and force display option",
		icon: Zap,
		windowsOnly: true,
	},
];

interface NotificationsTabProps {
	notificationMethod: NotificationDisplayMethod;
	onNotificationMethodChange: (method: NotificationDisplayMethod) => void;
	notificationForceDisplay: boolean;
	onNotificationForceDisplayChange: (enabled: boolean) => void;
	notificationShowActions: boolean;
	onNotificationShowActionsChange: (enabled: boolean) => void;
	notificationShowImages: boolean;
	onNotificationShowImagesChange: (enabled: boolean) => void;
	notificationSound: boolean;
	onNotificationSoundChange: (enabled: boolean) => void;
}

export function NotificationsTab({
	notificationMethod,
	onNotificationMethodChange,
	notificationForceDisplay,
	onNotificationForceDisplayChange,
	notificationShowActions,
	onNotificationShowActionsChange,
	notificationShowImages,
	onNotificationShowImagesChange,
	notificationSound,
	onNotificationSoundChange,
}: NotificationsTabProps) {
	const isWindowsEnhanced = notificationMethod === "windows_enhanced";

	return (
		<div className="space-y-4">
			<div className="space-y-3">
				<h4 className="text-sm font-medium flex items-center gap-2">
					<Bell className="h-4 w-4 text-muted-foreground" />
					Display Method
				</h4>
				<RadioGroup
					value={notificationMethod}
					onValueChange={(value) =>
						onNotificationMethodChange(value as NotificationDisplayMethod)
					}
					className="space-y-2"
				>
					{NOTIFICATION_METHODS.map((method) => (
						<div key={method.id} className="flex items-start space-x-3">
							<RadioGroupItem
								value={method.id}
								id={method.id}
								className="mt-1"
							/>
							<div className="flex-1">
								<Label
									htmlFor={method.id}
									className="flex items-center gap-2 cursor-pointer font-medium"
								>
									<method.icon className="h-4 w-4 text-muted-foreground" />
									{method.label}
									{method.windowsOnly && (
										<span className="text-xs bg-muted px-1.5 py-0.5 rounded">
											Windows only
										</span>
									)}
								</Label>
								<p className="text-xs text-muted-foreground mt-0.5">
									{method.description}
								</p>
							</div>
						</div>
					))}
				</RadioGroup>
			</div>

			<Separator />

			<div className="space-y-3">
				<h4 className="text-sm font-medium flex items-center gap-2">
					<Volume2 className="h-4 w-4 text-muted-foreground" />
					Sound
				</h4>

				<SettingCheckbox
					id="notification-sound"
					checked={notificationSound}
					onCheckedChange={onNotificationSoundChange}
					label="Play notification sound"
					description="Play a sound when new notifications arrive (respects system volume settings)"
				/>
			</div>

			{isWindowsEnhanced && (
				<>
					<Separator />

					<div className="space-y-3">
						<h4 className="text-sm font-medium">Windows Enhanced Options</h4>

						<SettingCheckbox
							id="force-display"
							checked={notificationForceDisplay}
							onCheckedChange={onNotificationForceDisplayChange}
							label="Force display"
							description="Show notifications even when Focus Assist or Do Not Disturb is active. Uses alarm-priority notifications."
						/>

						<SettingCheckbox
							id="show-actions"
							checked={notificationShowActions}
							onCheckedChange={onNotificationShowActionsChange}
							label="Show action buttons"
							description="Display action buttons from ntfy notifications (up to 3 buttons)"
							className="pt-2"
						/>

						<SettingCheckbox
							id="show-images"
							checked={notificationShowImages}
							onCheckedChange={onNotificationShowImagesChange}
							label="Show images"
							description="Display images from attachments or message content"
							className="pt-2"
						/>
					</div>
				</>
			)}
		</div>
	);
}
