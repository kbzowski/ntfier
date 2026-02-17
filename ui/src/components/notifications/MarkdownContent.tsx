import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { LazyImageWithFallback } from "@/components/ui/lazy-image";
import { preprocessMarkdown } from "@/lib/markdownPreprocessor";
import { cn } from "@/lib/utils";

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];
const MARKDOWN_COMPONENTS = {
	img: ({ src, alt }: { src?: string; alt?: string }) => {
		if (!src) return null;
		return <LazyImageWithFallback src={src} alt={alt} />;
	},
	a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="text-primary hover:underline"
		>
			{children}
		</a>
	),
	code: ({
		className,
		children,
		...props
	}: {
		className?: string;
		children?: React.ReactNode;
	}) => {
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
	pre: ({ children }: { children?: React.ReactNode }) => (
		<pre className="bg-muted p-3 rounded-lg overflow-x-auto text-xs my-2">
			{children}
		</pre>
	),
};

interface MarkdownContentProps {
	content: string;
	className?: string;
}

export const MarkdownContent = memo(function MarkdownContent({
	content,
	className,
}: MarkdownContentProps) {
	const processedContent = preprocessMarkdown(content);

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
				remarkPlugins={REMARK_PLUGINS}
				rehypePlugins={REHYPE_PLUGINS}
				components={MARKDOWN_COMPONENTS}
			>
				{processedContent}
			</ReactMarkdown>
		</div>
	);
});
