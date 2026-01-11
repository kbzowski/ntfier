import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/tauri";

/**
 * Subscribes to a Tauri event with automatic cleanup.
 *
 * Handles the async nature of Tauri's listen function and ensures
 * proper cleanup when the component unmounts.
 *
 * @param eventName - Name of the Tauri event to listen for
 * @param callback - Handler called when event is received
 *
 * @example
 * useTauriEvent('notification:new', (notification) => {
 *   console.log('New notification:', notification);
 * });
 */
export function useTauriEvent<T>(
	eventName: string,
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

		listen<T>(eventName, (event) => {
			if (mounted) {
				callbackRef.current(event.payload);
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
				console.error(`Failed to listen to ${eventName}:`, err);
			});

		return () => {
			mounted = false;
			unlisten?.();
		};
	}, [eventName]);
}
