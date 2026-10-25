import { describe, expect, it } from "vitest";
import { validateSettingsSearch } from "./settingsSearch";

describe("validateSettingsSearch", () => {
	it("has no server to edit when the param is missing", () => {
		expect(validateSettingsSearch({})).toEqual({});
	});

	it("has no server to edit when the param is empty", () => {
		expect(validateSettingsSearch({ editServer: "" })).toEqual({});
	});

	it("drops a param that isn't a URL", () => {
		expect(validateSettingsSearch({ editServer: "not a url" })).toEqual({});
		expect(validateSettingsSearch({ editServer: 42 })).toEqual({});
	});

	it("keeps a valid server URL", () => {
		expect(
			validateSettingsSearch({ editServer: "https://ntfy.example.com" }),
		).toEqual({ editServer: "https://ntfy.example.com" });
	});
});
