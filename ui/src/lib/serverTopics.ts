import type { Subscription } from "@/types/bindings";

export function countServerTopics(
	subscriptions: Pick<Subscription, "serverUrl">[],
	serverUrl: string,
): number {
	return subscriptions.filter((s) => s.serverUrl === serverUrl).length;
}
