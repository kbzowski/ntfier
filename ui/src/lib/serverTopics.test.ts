import { describe, expect, it } from "vitest";
import { countServerTopics } from "./serverTopics";

const sub = (serverUrl: string) => ({ serverUrl });

describe("countServerTopics", () => {
	it("returns 0 when there are no topics", () => {
		expect(countServerTopics([], "https://ntfy.sh")).toBe(0);
	});

	it("counts only the given server's topics among several servers", () => {
		const subs = [
			sub("https://ntfy.sh"),
			sub("https://a.example"),
			sub("https://ntfy.sh"),
			sub("https://b.example"),
		];
		expect(countServerTopics(subs, "https://ntfy.sh")).toBe(2);
		expect(countServerTopics(subs, "https://a.example")).toBe(1);
	});

	it("returns 0 for a server without topics", () => {
		const subs = [sub("https://ntfy.sh"), sub("https://a.example")];
		expect(countServerTopics(subs, "https://empty.example")).toBe(0);
	});
});
