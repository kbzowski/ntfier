import { createFileRoute } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-shell";
import Download from "lucide-react/dist/esm/icons/download";
import ImageIcon from "lucide-react/dist/esm/icons/image";
import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { classifyError } from "@/lib/error-classification";
import { isTauri } from "@/lib/tauri";
import { formatFileSize } from "@/lib/utils";

interface ImagePreviewSearch {
	url: string;
	name: string;
	size?: string;
}

function isValidHttpUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

export const Route = createFileRoute("/image-preview")({
	validateSearch: (search: Record<string, unknown>): ImagePreviewSearch => {
		const url = (search.url as string) ?? "";
		return {
			url: isValidHttpUrl(url) ? url : "",
			name: (search.name as string) ?? "Image",
			size: search.size as string | undefined,
		};
	},
	component: ImagePreview,
});

function ImagePreview() {
	const { url, name, size } = Route.useSearch();

	const handleDownload = useCallback(async () => {
		if (!url) return;
		try {
			if (isTauri()) {
				await open(url);
			} else {
				window.open(url, "_blank", "noopener,noreferrer");
			}
		} catch (err) {
			const classified = classifyError(err);
			toast.error(classified.userMessage, {
				description: "Failed to download image",
				action: {
					label: "Copy URL",
					onClick: () => {
						navigator.clipboard.writeText(url);
						toast.success("URL copied to clipboard");
					},
				},
			});
			console.error("[Download image error]", err);
		}
	}, [url]);

	if (!url) {
		return (
			<div className="h-screen w-screen bg-black flex items-center justify-center">
				<div className="text-center text-white/70">
					<ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
					<p className="text-sm">Invalid or missing image URL</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className="h-screen w-screen bg-black flex flex-col"
			data-tauri-drag-region
		>
			<div className="flex-1 flex items-center justify-center min-h-0 p-4">
				<img
					src={url}
					alt={name}
					className="max-w-full max-h-[calc(100vh-3.5rem)] object-contain"
					draggable={false}
				/>
			</div>

			<div className="h-14 shrink-0 px-4 flex items-center justify-between border-t border-white/10 bg-black/80 text-white/70">
				<div className="flex items-center gap-2 min-w-0">
					<ImageIcon className="h-4 w-4 shrink-0" />
					<span className="text-sm truncate">{name}</span>
					{size && (
						<span className="text-xs text-white/50">
							{formatFileSize(Number(size))}
						</span>
					)}
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8 shrink-0 text-white/70 hover:text-white hover:bg-white/10"
					onClick={handleDownload}
				>
					<Download className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
