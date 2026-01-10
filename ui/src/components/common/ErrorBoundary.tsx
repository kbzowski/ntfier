import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

	render(): ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<Card className="m-4 border-destructive">
					<CardContent className="flex flex-col items-center justify-center gap-4 p-8 text-center">
						<AlertTriangle className="h-12 w-12 text-destructive" />
						<div>
							<h2 className="text-lg font-semibold">Something went wrong</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								{this.state.error?.message || "An unexpected error occurred"}
							</p>
						</div>
						<Button
							onClick={this.handleReset}
							variant="outline"
							className="gap-2"
						>
							<RefreshCw className="h-4 w-4" />
							Try again
						</Button>
					</CardContent>
				</Card>
			);
		}

		return this.props.children;
	}
}

interface AppErrorBoundaryProps {
	children: ReactNode;
}

export function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
	return (
		<ErrorBoundary
			fallback={
				<div className="flex h-screen w-full items-center justify-center bg-background">
					<Card className="max-w-md border-destructive">
						<CardContent className="flex flex-col items-center justify-center gap-4 p-8 text-center">
							<AlertTriangle className="h-16 w-16 text-destructive" />
							<div>
								<h1 className="text-xl font-semibold">Application Error</h1>
								<p className="mt-2 text-sm text-muted-foreground">
									The application encountered an unexpected error. Please
									refresh the page to try again.
								</p>
							</div>
							<Button
								onClick={() => window.location.reload()}
								className="gap-2"
							>
								<RefreshCw className="h-4 w-4" />
								Refresh Page
							</Button>
						</CardContent>
					</Card>
				</div>
			}
		>
			{children}
		</ErrorBoundary>
	);
}
