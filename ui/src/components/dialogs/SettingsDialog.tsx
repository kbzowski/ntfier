import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { SettingsContent, type SettingsContentProps } from "./SettingsContent";

interface SettingsDialogProps extends SettingsContentProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({
	open,
	onOpenChange,
	...contentProps
}: SettingsDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
				<DialogHeader className="shrink-0">
					<DialogTitle>Settings</DialogTitle>
				</DialogHeader>
				<SettingsContent {...contentProps} />
			</DialogContent>
		</Dialog>
	);
}
