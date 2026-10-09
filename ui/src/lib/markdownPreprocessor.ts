/**
 * @module lib/markdownPreprocessor
 *
 * Makes plain URLs in notification content clickable. A plain URL never becomes an
 * image, even when it points to one: loading it would be a tracking pixel.
 */

// Standalone URLs, without trailing punctuation
const URL_REGEX = /(https?:\/\/[^\s<>"']+[^\s<>"'.,:;)\]])/g;

// Content that already has markdown links/images is left as written
const MARKDOWN_LINK_REGEX = /!?\[.*?\]\(.*?\)/;

/** Turns plain URLs in markdown content into markdown links. */
export function preprocessMarkdown(content: string): string {
	if (MARKDOWN_LINK_REGEX.test(content)) {
		return content;
	}
	return content.replace(URL_REGEX, (url) => `[${url}](${url})`);
}

/** Splits plain text into text and URL parts, for rendering links. */
export function splitUrls(content: string): { text: string; url: boolean }[] {
	return content
		.split(URL_REGEX)
		.filter(Boolean)
		.map((text) => ({ text, url: /^https?:\/\//.test(text) }));
}
