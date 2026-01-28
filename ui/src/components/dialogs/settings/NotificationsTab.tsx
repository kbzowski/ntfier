import { Bell, Monitor, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
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

			{isWindowsEnhanced && (
				<>
					<Separator />

					<div className="space-y-3">
						<h4 className="text-sm font-medium">Windows Enhanced Options</h4>

						<div className="flex items-center gap-2">
							<Checkbox
								id="force-display"
								checked={notificationForceDisplay}
								onCheckedChange={(checked) =>
									onNotificationForceDisplayChange(checked === true)
								}
							/>
							<label
								htmlFor="force-display"
								className="text-sm font-medium cursor-pointer"
							>
								Force display
							</label>
						</div>
						<p className="text-xs text-muted-foreground pl-6">
							Show notifications even when Focus Assist or Do Not Disturb is
							active. Uses alarm-priority notifications.
						</p>

						<div className="flex items-center gap-2 pt-2">
							<Checkbox
								id="show-actions"
								checked={notificationShowActions}
								onCheckedChange={(checked) =>
									onNotificationShowActionsChange(checked === true)
								}
							/>
							<label
								htmlFor="show-actions"
								className="text-sm font-medium cursor-pointer"
							>
								Show action buttons
							</label>
						</div>
						<p className="text-xs text-muted-foreground pl-6">
							Display action buttons from ntfy notifications (up to 3 buttons)
						</p>

						<div className="flex items-center gap-2 pt-2">
							<Checkbox
								id="show-images"
								checked={notificationShowImages}
								onCheckedChange={(checked) =>
									onNotificationShowImagesChange(checked === true)
								}
							/>
							<label
								htmlFor="show-images"
								className="text-sm font-medium cursor-pointer"
							>
								Show images
							</label>
						</div>
						<p className="text-xs text-muted-foreground pl-6">
							Display images from attachments or message content
						</p>
					</div>
				</>
			)}
		</div>
	);
}
