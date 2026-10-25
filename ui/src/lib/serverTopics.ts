import type { Subscription } from "@/types/bindings";

export function countServerTopics(
	subscriptions: Pick<Subscription, "serverUrl">[],
	serverUrl: string,
): number {
	return subscriptions.filter((s) => s.serverUrl === serverUrl).length;
}

export function applyServerRemoved<
	T extends Pick<Subscription, "id" | "serverUrl">,
>(
	subscriptions: T[],
	currentTopicId: string | null,
	serverUrl: string,
): { subscriptions: T[]; removedIds: string[]; currentTopicId: string | null } {
	const removedIds = subscriptions
		.filter((s) => s.serverUrl === serverUrl)
		.map((s) => s.id);
	return {
		subscriptions: subscriptions.filter((s) => s.serverUrl !== serverUrl),
		removedIds,
		currentTopicId:
			currentTopicId && removedIds.includes(currentTopicId)
				? null
				: currentTopicId,
	};
}
