import { Download, FileText, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyImage } from "@/hooks";
import type { Attachment } from "@/types/ntfy";

function LazyImage({
	src,
	alt,
	className,
}: {
	src: string;
	alt: string;
	className?: string;
}) {
	const { ref, isInView } = useLazyImage();

	return (
		<div ref={ref as React.RefObject<HTMLDivElement>}>
			{isInView ? (
				<img src={src} alt={alt} className={className} />
			) : (
				<div className="h-32 bg-muted animate-pulse" />
			)}
		</div>
	);
}

interface NotificationAttachmentsProps {
	attachments: Attachment[];
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NotificationAttachments({
	attachments,
}: NotificationAttachmentsProps) {
	if (attachments.length === 0) return null;

	return (
		<div className="mt-4 space-y-3">
			{attachments.map((attachment) => (
				<div key={attachment.id}>
					{attachment.type === "image" ? (
						<div className="rounded-lg overflow-hidden border border-border bg-muted/30">
							<LazyImage
								src={attachment.url}
								alt={attachment.name}
								className="max-h-48 w-auto object-contain"
							/>
							<div className="px-3 py-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border">
								<div className="flex items-center gap-2">
									<ImageIcon className="h-3.5 w-3.5" />
									<span className="truncate max-w-48">{attachment.name}</span>
								</div>
								{attachment.size && (
									<span>{formatFileSize(attachment.size)}</span>
								)}
							</div>
						</div>
					) : (
						<div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
							<FileText className="h-8 w-8 text-muted-foreground shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">
									{attachment.name}
								</p>
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
								onClick={() => window.open(attachment.url, "_blank")}
							>
								<Download className="h-4 w-4" />
							</Button>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
