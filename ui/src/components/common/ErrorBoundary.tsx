import { Component, type ReactNode } from "react";
import { toast } from "sonner";
import { ErrorCard } from "@/components/ui/error-card";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	onReset?: () => void;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
	}

	handleReset = (): void => {
		this.setState({ hasError: false, error: null });
		this.props.onReset?.();
	};

	handleCopyError = (): void => {
		if (this.state.error) {
			const errorText = `Error: ${this.state.error.message}\n\nStack: ${this.state.error.stack || "No stack trace available"}`;
			navigator.clipboard.writeText(errorText);
			toast.success("Error details copied to clipboard");
		}
	};

	render(): ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="m-4">
					<ErrorCard
						message="Something went wrong"
						details={
							this.state.error?.message || "An unexpected error occurred"
						}
						onRetry={this.handleReset}
						actions={[
							{
								label: "Copy Error",
								onClick: this.handleCopyError,
								variant: "ghost",
							},
						]}
						size="md"
					/>
				</div>
			);
		}

		return this.props.children;
	}
}

interface AppErrorBoundaryProps {
	children: ReactNode;
}

export function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
	const handleCopyError = () => {
		const errorText =
			"Application crashed. Please check the console for details.";
		navigator.clipboard.writeText(errorText);
		toast.success("Error details copied to clipboard");
	};

	return (
		<ErrorBoundary
			fallback={
				<div className="flex h-screen w-full items-center justify-center bg-background p-4">
					<ErrorCard
						message="Application Error"
						details="The application encountered an unexpected error. Please refresh the page to try again."
						onRetry={() => window.location.reload()}
						actions={[
							{
								label: "Copy Error",
								onClick: handleCopyError,
								variant: "ghost",
							},
						]}
						size="lg"
						className="max-w-lg"
					/>
				</div>
			}
		>
			{children}
		</ErrorBoundary>
	);
}
