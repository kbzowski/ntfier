import { describe, expect, it, vi } from "vitest";
import { commands } from "@/types/bindings";
import { BackendError } from "./error-classification";
import { subscriptionsApi } from "./tauri";

vi.mock("@/types/bindings", () => ({ commands: { toggleMute: vi.fn() } }));

const toggleMute = vi.mocked(commands.toggleMute);

describe("backend command errors", () => {
	it("returns the command's data", async () => {
		toggleMute.mockResolvedValue({ id: "s1" } as never);
		await expect(subscriptionsApi.toggleMute("s1")).resolves.toEqual({
			id: "s1",
		});
	});

	it("turns an AppError into a BackendError with its variant", async () => {
		toggleMute.mockRejectedValue({ NotFound: "no such subscription" });
		const error = await subscriptionsApi.toggleMute("s1").catch((e) => e);
		expect(error).toBeInstanceOf(BackendError);
		expect(error.message).toBe("no such subscription");
		expect(error.kind).toBe("NotFound");
	});

	it("passes an Error through unchanged", async () => {
		const original = new Error("IPC failed");
		toggleMute.mockRejectedValue(original);
		await expect(subscriptionsApi.toggleMute("s1")).rejects.toBe(original);
	});

	it("gives a plain string rejection an empty kind", async () => {
		toggleMute.mockRejectedValue("command not found");
		const error = await subscriptionsApi.toggleMute("s1").catch((e) => e);
		expect(error).toBeInstanceOf(BackendError);
		expect(error.message).toBe("command not found");
		expect(error.kind).toBe("");
	});
});
