import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-shell";
import {
	AlertTriangle,
	Download,
	FileText,
	Image as ImageIcon,
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

function ImageCard({
	attachment,
	onImageClick,
	onImageError,
	onDownload,
}: {
	attachment: Attachment;
	onImageClick: (attachment: Attachment) => void;
	onImageError: (id: string) => void;
	onDownload: (url: string) => void;
}) {
	return (
		<button
			type="button"
			className="rounded-lg overflow-hidden border border-border bg-muted/30 cursor-pointer w-full text-left"
			onClick={() => onImageClick(attachment)}
		>
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

	const handleImageClick = useCallback(async (attachment: Attachment) => {
		if (!isTauri()) {
			window.open(attachment.url, "_blank", "noopener,noreferrer");
			return;
		}

		try {
			const existing = await WebviewWindow.getByLabel("image-preview");
			if (existing) {
				await existing.close();
			}
		} catch {
			// Window doesn't exist, proceed
		}

		const params = new URLSearchParams({
			url: attachment.url,
			name: attachment.name,
		});
		if (attachment.size != null) {
			params.set("size", String(attachment.size));
		}

		new WebviewWindow("image-preview", {
			url: `/image-preview?${params.toString()}`,
			title: attachment.name,
			width: 800,
			height: 600,
			resizable: true,
			center: true,
		});
	}, []);

	const [failedImages, setFailedImages] = useState<Set<string>>(
		() => new Set(),
	);
	const unavailable = useAttachmentAvailability(attachments);

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

				if (isImageAttachment(attachment) && !failedImages.has(attachment.id)) {
					return (
						<ImageCard
							key={attachment.id}
							attachment={attachment}
							onImageClick={handleImageClick}
							onImageError={handleImageError}
							onDownload={handleDownload}
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
