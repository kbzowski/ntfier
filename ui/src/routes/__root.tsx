import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AppErrorBoundary } from "@/components/common/ErrorBoundary";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { AppProvider } from "@/context/AppContext";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Ntfier",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="overflow-hidden">
				<AppErrorBoundary>
					<ThemeProvider>
						<AppProvider>{children}</AppProvider>
					</ThemeProvider>
				</AppErrorBoundary>
				<Scripts />
			</body>
		</html>
	);
}
