import { describe, expect, it } from "vitest";
import { formatTimestamp } from "./RelativeTime";

const now = Date.UTC(2026, 9, 9, 12, 0, 0);
const ago = (ms: number) => formatTimestamp(now - ms, now);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatTimestamp", () => {
	it("says just now under a minute", () => {
		expect(ago(59 * SEC)).toBe("just now");
	});

	it("switches to minutes at 60s", () => {
		expect(ago(60 * SEC)).toBe("1m ago");
		expect(ago(59 * MIN)).toBe("59m ago");
	});

	it("uses hours and days", () => {
		expect(ago(23 * HOUR)).toBe("23h ago");
		expect(ago(6 * DAY)).toBe("6d ago");
	});

	it("shows the date from 7 days on", () => {
		expect(ago(7 * DAY)).toBe(new Date(now - 7 * DAY).toLocaleDateString());
	});
});
