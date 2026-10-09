import { describe, expect, it } from "vitest";
import { preprocessMarkdown, splitUrls } from "./markdownPreprocessor";

describe("preprocessMarkdown", () => {
	it("links plain URLs, image URLs included", () => {
		expect(preprocessMarkdown("see https://x.io/a.png now")).toBe(
			"see [https://x.io/a.png](https://x.io/a.png) now",
		);
	});

	it("leaves existing markdown links alone", () => {
		const md = "![pic](https://x.io/a.png) and https://y.io";
		expect(preprocessMarkdown(md)).toBe(md);
	});
});

describe("splitUrls", () => {
	it("separates URLs from text", () => {
		expect(splitUrls("go to https://x.io/a, then")).toEqual([
			{ text: "go to ", url: false },
			{ text: "https://x.io/a", url: true },
			{ text: ", then", url: false },
		]);
	});
});
