/**
 * Reusable error card component for displaying errors in sections
 */

import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorCardProps {
	/**
	 * Main error message
	 */
	message: string;

	/**
	 * Optional detailed error information
	 */
	details?: string;

	/**
	 * Retry callback
	 */
	onRetry?: () => void;

	/**
	 * Additional actions (buttons)
	 */
	actions?: Array<{
		label: string;
		onClick: () => void;
		variant?: "default" | "outline" | "ghost";
	}>;

	/**
	 * Additional CSS classes
	 */
	className?: string;

	/**
	 * Size variant
	 */
	size?: "sm" | "md" | "lg";
}

export function ErrorCard({
	message,
	details,
	onRetry,
	actions = [],
	className,
	size = "md",
}: ErrorCardProps) {
	const padding = {
		sm: "p-4",
		md: "p-6",
		lg: "p-8",
	}[size];

	const iconSize = {
		sm: "h-8 w-8",
		md: "h-12 w-12",
		lg: "h-16 w-16",
	}[size];

	const titleSize = {
		sm: "text-base",
		md: "text-lg",
		lg: "text-xl",
	}[size];

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 text-center",
				padding,
				className,
			)}
			role="alert"
			aria-live="assertive"
		>
			<AlertTriangle className={cn("text-destructive mb-4", iconSize)} />
			<h3 className={cn("font-semibold text-destructive mb-2", titleSize)}>
				{message}
			</h3>
			{details && (
				<p className="text-sm text-muted-foreground mb-4 max-w-md">{details}</p>
			)}
			{(onRetry || actions.length > 0) && (
				<div className="flex flex-wrap items-center justify-center gap-2">
					{onRetry && (
						<Button
							onClick={onRetry}
							variant="default"
							size={size === "sm" ? "sm" : "default"}
							className="gap-2"
						>
							<RefreshCw className="h-4 w-4" />
							Retry
						</Button>
					)}
					{actions.map((action) => (
						<Button
							key={action.label}
							onClick={action.onClick}
							variant={action.variant || "outline"}
							size={size === "sm" ? "sm" : "default"}
						>
							{action.label}
						</Button>
					))}
				</div>
			)}
		</div>
	);
}
