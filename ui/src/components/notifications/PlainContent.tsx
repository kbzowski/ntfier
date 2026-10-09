import { memo } from "react";
import { splitUrls } from "@/lib/markdownPreprocessor";

/** A message that isn't markdown: shown as sent, with clickable links. */
export const PlainContent = memo(function PlainContent({
	content,
}: {
	content: string;
}) {
	return (
		<p className="whitespace-pre-wrap break-words">
			{splitUrls(content).map((part, i) =>
				part.url ? (
					<a
						// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
						key={i}
						href={part.text}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						{part.text}
					</a>
				) : (
					part.text
				),
			)}
		</p>
	);
});
