import { describe, expect, it } from "vitest";
import { applyServerRemoved, countServerTopics } from "./serverTopics";

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

describe("applyServerRemoved", () => {
	const subs = [
		{ id: "a1", serverUrl: "https://a.example" },
		{ id: "n1", serverUrl: "https://ntfy.sh" },
		{ id: "a2", serverUrl: "https://a.example" },
	];

	it("drops the server's topics and keeps the others", () => {
		const result = applyServerRemoved(subs, null, "https://a.example");
		expect(result.subscriptions).toEqual([
			{ id: "n1", serverUrl: "https://ntfy.sh" },
		]);
		expect(result.removedIds).toEqual(["a1", "a2"]);
	});

	it("clears the selected topic when it was on that server", () => {
		expect(
			applyServerRemoved(subs, "a2", "https://a.example").currentTopicId,
		).toBeNull();
	});

	it("keeps the selected topic when it was on another server", () => {
		expect(
			applyServerRemoved(subs, "n1", "https://a.example").currentTopicId,
		).toBe("n1");
	});

	it("changes nothing for a server without topics", () => {
		const result = applyServerRemoved(subs, "a1", "https://empty.example");
		expect(result.subscriptions).toEqual(subs);
		expect(result.removedIds).toEqual([]);
		expect(result.currentTopicId).toBe("a1");
	});
});
