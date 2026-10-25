import { describe, expect, it } from "vitest";
import {
	applyServerRemoved,
	countServerSubscriptions,
} from "./serverSubscriptions";

const sub = (serverUrl: string) => ({ serverUrl });

describe("countServerSubscriptions", () => {
	it("returns 0 when there are no subscriptions", () => {
		expect(countServerSubscriptions([], "https://ntfy.sh")).toBe(0);
	});

	it("counts only the given server's subscriptions among several servers", () => {
		const subs = [
			sub("https://ntfy.sh"),
			sub("https://a.example"),
			sub("https://ntfy.sh"),
			sub("https://b.example"),
		];
		expect(countServerSubscriptions(subs, "https://ntfy.sh")).toBe(2);
		expect(countServerSubscriptions(subs, "https://a.example")).toBe(1);
	});

	it("returns 0 for a server without subscriptions", () => {
		const subs = [sub("https://ntfy.sh"), sub("https://a.example")];
		expect(countServerSubscriptions(subs, "https://empty.example")).toBe(0);
	});
});

describe("applyServerRemoved", () => {
	const subs = [
		{ id: "a1", serverUrl: "https://a.example" },
		{ id: "n1", serverUrl: "https://ntfy.sh" },
		{ id: "a2", serverUrl: "https://a.example" },
	];

	it("drops the server's subscriptions and keeps the others", () => {
		const result = applyServerRemoved(subs, null, "https://a.example");
		expect(result.subscriptions).toEqual([
			{ id: "n1", serverUrl: "https://ntfy.sh" },
		]);
		expect(result.removedIds).toEqual(["a1", "a2"]);
	});

	it("clears the selected subscription when it was on that server", () => {
		expect(
			applyServerRemoved(subs, "a2", "https://a.example").currentTopicId,
		).toBeNull();
	});

	it("keeps the selected subscription when it was on another server", () => {
		expect(
			applyServerRemoved(subs, "n1", "https://a.example").currentTopicId,
		).toBe("n1");
	});

	it("changes nothing for a server without subscriptions", () => {
		const result = applyServerRemoved(subs, "a1", "https://empty.example");
		expect(result.subscriptions).toEqual(subs);
		expect(result.removedIds).toEqual([]);
		expect(result.currentTopicId).toBe("a1");
	});
});
