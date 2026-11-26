import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/tauri";

/** An entry of `events` in the generated bindings. */
interface TauriEvent<T> {
	listen: (cb: EventCallback<T>) => Promise<UnlistenFn>;
}

/**
 * Subscribes to a Tauri event with automatic cleanup.
 *
 * Handles the async nature of Tauri's listen function and ensures
 * proper cleanup when the component unmounts.
 *
 * @param event - The event from `events` in the generated bindings
 * @param callback - Handler called when event is received
 *
 * @example
 * useTauriEvent(events.notificationNew, (notification) => {
 *   console.log('New notification:', notification);
 * });
 */
export function useTauriEvent<T>(
	event: TauriEvent<T>,
	callback: (payload: T) => void,
): void {
	const callbackRef = useRef(callback);

	// Keep callback ref up to date
	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	useEffect(() => {
		if (!isTauri()) return;

		let unlisten: UnlistenFn | undefined;
		let mounted = true;

		event
			.listen(({ payload }) => {
				if (mounted) {
					callbackRef.current(payload);
				}
			})
			.then((unlistenFn) => {
				if (mounted) {
					unlisten = unlistenFn;
				} else {
					// Component unmounted while waiting, cleanup immediately
					unlistenFn();
				}
			})
			.catch((err) => {
				console.error("Failed to listen to a Tauri event:", err);
			});

		return () => {
			mounted = false;
			unlisten?.();
		};
	}, [event]);
}
