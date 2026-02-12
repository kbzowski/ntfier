import Download from "lucide-react/dist/esm/icons/download";
import X from "lucide-react/dist/esm/icons/x";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { UpdateInfo } from "@/types/ntfy";

interface UpdateToastProps {
	updateInfo: UpdateInfo | null;
	onOpenSettings: () => void;
	onDismiss: () => void;
}

export function UpdateToast({
	updateInfo,
	onOpenSettings,
	onDismiss,
}: UpdateToastProps) {
	const [visible, setVisible] = useState(false);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		if (updateInfo && !dismissed) {
			// Small delay before showing toast
			const timer = setTimeout(() => setVisible(true), 500);
			return () => clearTimeout(timer);
		}
		setVisible(false);
	}, [updateInfo, dismissed]);

	const handleDismiss = () => {
		setVisible(false);
		setDismissed(true);
		onDismiss();
	};

	const handleClick = () => {
		setVisible(false);
		setDismissed(true);
		onOpenSettings();
	};

	if (!visible || !updateInfo) {
		return null;
	}

	return (
		<div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
			<div className="flex items-center gap-3 rounded-lg border bg-background p-4 shadow-lg">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
					<Download className="h-5 w-5 text-primary" />
				</div>
				<div className="flex-1">
					<p className="text-sm font-medium">Update Available</p>
					<p className="text-xs text-muted-foreground">
						Version {updateInfo.version} is ready to install
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button size="sm" variant="default" onClick={handleClick}>
						View
					</Button>
					<Button
						size="icon"
						variant="ghost"
						className="h-8 w-8"
						onClick={handleDismiss}
					>
						<X className="h-4 w-4" />
						<span className="sr-only">Dismiss</span>
					</Button>
				</div>
			</div>
		</div>
	);
}
