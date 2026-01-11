/**
 * @module lib/markdownPreprocessor
 *
 * Preprocesses notification content to enhance URL handling.
 * Converts plain URLs to markdown links and image URLs to embedded images.
 */

// Regex to detect image URLs - matches URLs ending with image extensions (with optional query string)
const IMAGE_URL_REGEX =
	/(https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico)(?:\?[^\s<>"']*)?)/gi;

// Regex to detect standalone URLs that should be converted to links
const URL_REGEX = /(https?:\/\/[^\s<>"']+[^\s<>"'.,:;)\]])/g;

// Regex to detect if content already has markdown formatting
const MARKDOWN_LINK_REGEX = /\[.*?\]\(.*?\)/;
const MARKDOWN_IMAGE_REGEX = /!\[.*?\]\(.*?\)/;

/**
 * Checks if a URL points to an image file.
 */
function isImageUrl(url: string): boolean {
	return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(url);
}

/**
 * Preprocesses plain text content to convert URLs to markdown format.
 *
 * - Converts image URLs to markdown images: ![](url)
 * - Converts other URLs to markdown links: [url](url)
 * - Skips content that already contains markdown formatting
 */
export function preprocessMarkdown(content: string): string {
	// If content already contains markdown links/images, don't preprocess URLs
	// This prevents double-processing of already formatted content
	if (MARKDOWN_LINK_REGEX.test(content) || MARKDOWN_IMAGE_REGEX.test(content)) {
		return content;
	}

	let processed = content;

	// Convert plain image URLs to markdown images
	processed = processed.replace(IMAGE_URL_REGEX, (url) => {
		return `![](${url})`;
	});

	// Convert remaining plain URLs to links (skip images)
	processed = processed.replace(URL_REGEX, (url) => {
		if (isImageUrl(url)) {
			return url;
		}
		return `[${url}](${url})`;
	});

	return processed;
}
