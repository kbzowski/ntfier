import { type RefObject, useState } from "react";
import { useLazyImage } from "@/hooks/useLazyImage";
import { cn } from "@/lib/utils";

interface LazyImageProps {
	src: string;
	alt: string;
	className?: string;
	placeholderClassName?: string;
}

/**
 * Basic lazy-loaded image that shows a placeholder until in view.
 */
export function LazyImage({
	src,
	alt,
	className,
	placeholderClassName = "h-32 bg-muted animate-pulse",
}: LazyImageProps) {
	const { ref, isInView } = useLazyImage();

	return (
		<div ref={ref as RefObject<HTMLDivElement>}>
			{isInView ? (
				<img src={src} alt={alt} className={className} />
			) : (
				<div className={placeholderClassName} />
			)}
		</div>
	);
}

interface LazyImageWithFallbackProps {
	src: string;
	alt?: string;
	className?: string;
	placeholderClassName?: string;
}

/**
 * Lazy-loaded image with error handling that falls back to a link on failure.
 */
export function LazyImageWithFallback({
	src,
	alt,
	className,
	placeholderClassName = "h-32 bg-muted animate-pulse rounded-lg",
}: LazyImageWithFallbackProps) {
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);
	const { ref, isInView } = useLazyImage();

	if (error) {
		return (
			<a
				href={src}
				target="_blank"
				rel="noopener noreferrer"
				className="text-primary hover:underline break-all"
			>
				{alt || src}
			</a>
		);
	}

	return (
		<span ref={ref as RefObject<HTMLSpanElement>} className="block my-2">
			{loading && <span className={cn("block", placeholderClassName)} />}
			{isInView && (
				<img
					src={src}
					alt={alt || "Image"}
					className={cn(
						"max-w-full h-auto rounded-lg border border-border",
						"max-h-64 object-contain",
						loading && "hidden",
						className,
					)}
					onLoad={() => setLoading(false)}
					onError={() => {
						setError(true);
						setLoading(false);
					}}
				/>
			)}
		</span>
	);
}
