import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function tick() {
	now = Date.now();
	for (const listener of listeners) listener();
}

function onTimer() {
	if (!document.hidden) tick();
}

function onVisibilityChange() {
	if (!document.hidden) tick();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (listeners.size === 1) {
		now = Date.now();
		timer = setInterval(onTimer, TICK_MS);
		document.addEventListener("visibilitychange", onVisibilityChange);
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		}
	};
}

const getSnapshot = () => now;

/** Shared clock that ticks every 30s, paused while the window is hidden. */
export function useNow(): number {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
