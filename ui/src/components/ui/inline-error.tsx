/**
 * Inline error component for form fields and validation errors
 */

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineErrorProps {
	/**
	 * Error message to display
	 */
	message: string;

	/**
	 * Additional CSS classes
	 */
	className?: string;

	/**
	 * Size variant
	 */
	size?: "sm" | "md";
}

export function InlineError({
	message,
	className,
	size = "md",
}: InlineErrorProps) {
	return (
		<div
			className={cn(
				"flex items-start gap-2 rounded-md bg-destructive/10 text-destructive",
				size === "sm" ? "p-2 text-xs" : "p-3 text-sm",
				className,
			)}
			role="alert"
			aria-live="polite"
		>
			<AlertCircle
				className={cn(
					"flex-shrink-0",
					size === "sm" ? "h-3 w-3 mt-0.5" : "h-4 w-4 mt-0.5",
				)}
			/>
			<p className="flex-1">{message}</p>
		</div>
	);
}
