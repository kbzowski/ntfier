import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
	content: string;
	className?: string;
}

// Regex to detect image URLs - matches URLs ending with image extensions (with optional query string)
const IMAGE_URL_REGEX = /(https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico)(?:\?[^\s<>"']*)?)/gi;

// Regex to detect standalone URLs that should be converted to links
const URL_REGEX = /(https?:\/\/[^\s<>"']+[^\s<>"'.,:;)\]])/g;

function ImageWithFallback({ src, alt }: { src: string; alt?: string }) {
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);
	const [isInView, setIsInView] = useState(false);
	const containerRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsInView(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "100px" },
		);

		observer.observe(container);
		return () => observer.disconnect();
	}, []);

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
		<span ref={containerRef} className="block my-2">
			{loading && (
				<span className="block h-32 bg-muted animate-pulse rounded-lg" />
			)}
			{isInView && (
				<img
					src={src}
					alt={alt || "Image"}
					className={cn(
						"max-w-full h-auto rounded-lg border border-border",
						"max-h-64 object-contain",
						loading && "hidden",
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

function preprocessContent(content: string): string {
	// If content already contains markdown links/images, don't preprocess URLs
	// This prevents double-processing of already formatted content
	const hasMarkdownLinks = /\[.*?\]\(.*?\)/.test(content);
	const hasMarkdownImages = /!\[.*?\]\(.*?\)/.test(content);

	if (hasMarkdownLinks || hasMarkdownImages) {
		// Content already has markdown formatting, return as-is
		return content;
	}

	let processed = content;

	// Convert plain image URLs to markdown images
	processed = processed.replace(IMAGE_URL_REGEX, (url) => {
		return `![](${url})`;
	});

	// Convert remaining plain URLs to links (skip images)
	processed = processed.replace(URL_REGEX, (url) => {
		// Skip if it's an image URL (already converted above)
		if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i)) {
			return url;
		}
		return `[${url}](${url})`;
	});

	return processed;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
	const processedContent = preprocessContent(content);

	return (
		<div
			className={cn(
				"prose prose-sm dark:prose-invert max-w-none",
				"prose-p:my-1 prose-p:leading-relaxed",
				"prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
				"prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs",
				"prose-pre:bg-muted prose-pre:p-3 prose-pre:rounded-lg prose-pre:overflow-x-auto",
				"prose-ul:my-1 prose-ol:my-1 prose-li:my-0",
				"prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground",
				"prose-img:my-2 prose-img:rounded-lg",
				"prose-headings:mt-3 prose-headings:mb-1",
				"[&_*]:break-words",
				className,
			)}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks]}
				rehypePlugins={[rehypeRaw]}
				components={{
				// Custom image renderer with fallback
				img: ({ src, alt }) => {
					if (!src) return null;
					return <ImageWithFallback src={src} alt={alt} />;
				},
				// Open links in new tab
				a: ({ href, children }) => (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						{children}
					</a>
				),
				// Better code blocks
				code: ({ className, children, ...props }) => {
					const isInline = !className;
					if (isInline) {
						return (
							<code
								className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
								{...props}
							>
								{children}
							</code>
						);
					}
					return (
						<code className={cn("text-xs font-mono", className)} {...props}>
							{children}
						</code>
					);
				},
				// Better pre blocks
				pre: ({ children }) => (
					<pre className="bg-muted p-3 rounded-lg overflow-x-auto text-xs my-2">
						{children}
					</pre>
				),
				}}
			>
				{processedContent}
			</ReactMarkdown>
		</div>
	);
}
