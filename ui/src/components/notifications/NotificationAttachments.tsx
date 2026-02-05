import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-shell";
import {
	AlertTriangle,
	Download,
	ExternalLink,
	FileText,
	Image as ImageIcon,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/tauri";
import { formatFileSize } from "@/lib/utils";
import type { Attachment } from "@/types/ntfy";

const IMAGE_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".svg",
	".bmp",
	".ico",
	".avif",
]);

function isImageAttachment(attachment: Attachment): boolean {
	if (attachment.type?.startsWith("image/")) return true;
	const ext = attachment.name.lastIndexOf(".");
	if (ext !== -1) {
		return IMAGE_EXTENSIONS.has(attachment.name.slice(ext).toLowerCase());
	}
	return false;
}

function useAttachmentAvailability(attachments: Attachment[]) {
	const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
	const checkedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		for (const attachment of attachments) {
			if (checkedRef.current.has(attachment.id)) continue;
			checkedRef.current.add(attachment.id);

			const markUnavailable = () =>
				setUnavailable((prev) => new Set(prev).add(attachment.id));

			fetch(attachment.url, { method: "HEAD" })
				.then((res) => {
					if (!res.ok) markUnavailable();
				})
				.catch(markUnavailable);
		}
	}, [attachments]);

	return unavailable;
}

function UnavailableCard({ name }: { name: string }) {
	return (
		<div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border bg-muted/20 text-muted-foreground">
			<AlertTriangle className="h-8 w-8 shrink-0 opacity-50" />
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate">{name}</p>
				<p className="text-xs">Attachment is not available</p>
			</div>
		</div>
	);
}

function ImagePreviewError({
	name,
	error,
	onRetry,
	onOpenInBrowser,
}: {
	name: string;
	error: string;
	onRetry: () => void;
	onOpenInBrowser: () => void;
}) {
	return (
		<div className="flex flex-col gap-3 p-4 rounded-lg border border-destructive bg-destructive/10">
			<div className="flex items-start gap-3">
				<AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-destructive">{name}</p>
					<p className="text-xs text-muted-foreground mt-1">
						Failed to open image preview
					</p>
					{error && (
						<p className="text-xs text-muted-foreground mt-1 font-mono">
							{error}
						</p>
					)}
				</div>
			</div>
			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="flex-1"
					onClick={onRetry}
				>
					<RefreshCw className="h-3.5 w-3.5 mr-2" />
					Try Again
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="flex-1"
					onClick={onOpenInBrowser}
				>
					<ExternalLink className="h-3.5 w-3.5 mr-2" />
					Open in Browser
				</Button>
			</div>
		</div>
	);
}

function ImageCard({
	attachment,
	onImageClick,
	onImageError,
	onDownload,
	isLoading,
}: {
	attachment: Attachment;
	onImageClick: (attachment: Attachment) => void;
	onImageError: (id: string) => void;
	onDownload: (url: string) => void;
	isLoading?: boolean;
}) {
	return (
		<button
			type="button"
			className="rounded-lg overflow-hidden border border-border bg-muted/30 cursor-pointer w-full text-left relative"
			onClick={() => onImageClick(attachment)}
			disabled={isLoading}
		>
			{isLoading && (
				<div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
					<Loader2 className="h-6 w-6 animate-spin text-primary" />
				</div>
			)}
			<img
				src={attachment.url}
				alt={attachment.name}
				className="max-h-48 w-auto object-contain"
				onError={() => onImageError(attachment.id)}
			/>
			<div className="px-3 py-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border">
				<div className="flex items-center gap-2">
					<ImageIcon className="h-3.5 w-3.5" />
					<span className="truncate max-w-48">{attachment.name}</span>
					{attachment.size && <span>{formatFileSize(attachment.size)}</span>}
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6 shrink-0"
					onClick={(e) => {
						e.stopPropagation();
						onDownload(attachment.url);
					}}
				>
					<Download className="h-3.5 w-3.5" />
				</Button>
			</div>
		</button>
	);
}

function FileCard({
	attachment,
	onDownload,
}: {
	attachment: Attachment;
	onDownload: (url: string) => void;
}) {
	return (
		<div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
			<FileText className="h-8 w-8 text-muted-foreground shrink-0" />
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate">{attachment.name}</p>
				{attachment.size && (
					<p className="text-xs text-muted-foreground">
						{formatFileSize(attachment.size)}
					</p>
				)}
			</div>
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8 shrink-0"
				onClick={() => onDownload(attachment.url)}
			>
				<Download className="h-4 w-4" />
			</Button>
		</div>
	);
}

interface NotificationAttachmentsProps {
	attachments: Attachment[];
}

export const NotificationAttachments = memo(function NotificationAttachments({
	attachments,
}: NotificationAttachmentsProps) {
	const [previewErrors, setPreviewErrors] = useState<Map<string, string>>(
		() => new Map(),
	);
	const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
	const [failedImages, setFailedImages] = useState<Set<string>>(
		() => new Set(),
	);
	const unavailable = useAttachmentAvailability(attachments);

	const handleDownload = useCallback(async (url: string) => {
		try {
			if (isTauri()) {
				await open(url);
			} else {
				window.open(url, "_blank", "noopener,noreferrer");
			}
		} catch (err) {
			console.error("Failed to open attachment URL:", err);
		}
	}, []);

	const openInBrowser = useCallback(async (url: string) => {
		console.log("[ImagePreview] Opening in browser fallback:", url);
		try {
			if (isTauri()) {
				await open(url);
			} else {
				window.open(url, "_blank", "noopener,noreferrer");
			}
		} catch (fallbackErr) {
			console.error("[ImagePreview] Browser fallback failed:", fallbackErr);
			// Ultimate fallback
			window.open(url, "_blank", "noopener,noreferrer");
		}
	}, []);

	const handleImageClick = useCallback(
		async (attachment: Attachment) => {
			console.log("[ImagePreview] Click handler triggered", {
				id: attachment.id,
				name: attachment.name,
				url: attachment.url,
			});

			// Clear any previous errors for this attachment
			if (previewErrors.has(attachment.id)) {
				setPreviewErrors((prev) => {
					const next = new Map(prev);
					next.delete(attachment.id);
					return next;
				});
			}

			if (!isTauri()) {
				console.log(
					"[ImagePreview] Not in Tauri environment, using browser fallback",
				);
				window.open(attachment.url, "_blank", "noopener,noreferrer");
				return;
			}

			setLoadingPreview(attachment.id);

			try {
				// Try to close existing window
				console.log("[ImagePreview] Checking for existing window");
				const existing = await WebviewWindow.getByLabel("image-preview");
				if (existing) {
					console.log("[ImagePreview] Closing existing window");
					await existing.close();
				}
			} catch (err) {
				console.log(
					"[ImagePreview] No existing window to close (this is fine)",
					err,
				);
			}

			// Build URL parameters
			const params = new URLSearchParams({
				url: attachment.url,
				name: attachment.name,
			});
			if (attachment.size != null) {
				params.set("size", String(attachment.size));
			}

			const windowUrl = `/image-preview?${params.toString()}`;
			const windowConfig = {
				url: windowUrl,
				title: attachment.name,
				width: 800,
				height: 600,
				resizable: true,
				center: true,
			};

			console.log("[ImagePreview] Creating new window", {
				label: "image-preview",
				config: windowConfig,
			});

			try {
				const webviewWindow = new WebviewWindow("image-preview", windowConfig);

				// Listen to window events for debugging
				webviewWindow.once("tauri://created", () => {
					console.log("[ImagePreview] Window created successfully");
					setLoadingPreview(null);
				});

				webviewWindow.once("tauri://error", (e) => {
					console.error("[ImagePreview] Window error event received:", e);
					console.error("[ImagePreview] Error type:", typeof e);
					console.error("[ImagePreview] Error stringified:", JSON.stringify(e));

					let errorMsg = "Failed to create window";
					if (typeof e === "string") {
						errorMsg = e;
					} else if (e && typeof e === "object") {
						errorMsg = JSON.stringify(e, null, 2);
					}

					console.error("[ImagePreview] Final error message:", errorMsg);
					setPreviewErrors((prev) =>
						new Map(prev).set(attachment.id, errorMsg),
					);
					setLoadingPreview(null);

					// Automatic fallback to browser
					console.log("[ImagePreview] Attempting automatic browser fallback");
					openInBrowser(attachment.url);
				});
			} catch (err) {
				console.error("[ImagePreview] Exception caught during window creation");
				console.error("[ImagePreview] Error object:", err);
				console.error("[ImagePreview] Error type:", typeof err);
				console.error(
					"[ImagePreview] Error constructor:",
					err?.constructor?.name,
				);

				if (err instanceof Error) {
					console.error("[ImagePreview] Error message:", err.message);
					console.error("[ImagePreview] Error stack:", err.stack);
				}

				let errorMsg = "Unknown error";
				if (err instanceof Error) {
					errorMsg = `${err.name}: ${err.message}`;
				} else if (typeof err === "string") {
					errorMsg = err;
				} else if (err && typeof err === "object") {
					errorMsg = JSON.stringify(err, null, 2);
				} else {
					errorMsg = String(err);
				}

				console.error(
					"[ImagePreview] Final error message to display:",
					errorMsg,
				);
				setPreviewErrors((prev) => new Map(prev).set(attachment.id, errorMsg));
				setLoadingPreview(null);

				// Automatic fallback to browser
				console.log("[ImagePreview] Attempting automatic browser fallback");
				await openInBrowser(attachment.url);
			}
		},
		[previewErrors, openInBrowser],
	);

	const handleRetry = useCallback(
		(attachment: Attachment) => {
			console.log("[ImagePreview] Retry requested for:", attachment.id);
			handleImageClick(attachment);
		},
		[handleImageClick],
	);

	const handleOpenInBrowser = useCallback(
		(attachment: Attachment) => {
			console.log("[ImagePreview] Manual browser open for:", attachment.id);
			// Clear the error
			setPreviewErrors((prev) => {
				const next = new Map(prev);
				next.delete(attachment.id);
				return next;
			});
			openInBrowser(attachment.url);
		},
		[openInBrowser],
	);

	const handleImageError = useCallback((id: string) => {
		setFailedImages((prev) => new Set(prev).add(id));
	}, []);

	if (attachments.length === 0) return null;

	return (
		<div className="mt-4 space-y-3">
			{attachments.map((attachment) => {
				if (unavailable.has(attachment.id)) {
					return <UnavailableCard key={attachment.id} name={attachment.name} />;
				}

				// Show error card if preview failed
				if (previewErrors.has(attachment.id)) {
					return (
						<ImagePreviewError
							key={attachment.id}
							name={attachment.name}
							error={previewErrors.get(attachment.id) || ""}
							onRetry={() => handleRetry(attachment)}
							onOpenInBrowser={() => handleOpenInBrowser(attachment)}
						/>
					);
				}

				if (isImageAttachment(attachment) && !failedImages.has(attachment.id)) {
					return (
						<ImageCard
							key={attachment.id}
							attachment={attachment}
							onImageClick={handleImageClick}
							onImageError={handleImageError}
							onDownload={handleDownload}
							isLoading={loadingPreview === attachment.id}
						/>
					);
				}

				return (
					<FileCard
						key={attachment.id}
						attachment={attachment}
						onDownload={handleDownload}
					/>
				);
			})}
		</div>
	);
});
