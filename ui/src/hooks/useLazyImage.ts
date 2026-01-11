import { useEffect, useRef, useState } from "react";

interface UseLazyImageOptions {
	rootMargin?: string;
}

interface UseLazyImageReturn {
	ref: React.RefObject<HTMLElement | null>;
	isInView: boolean;
}

/**
 * Hook for lazy loading images using IntersectionObserver.
 *
 * @param options.rootMargin - Margin around the root for triggering load (default: "100px")
 * @returns ref to attach to container and isInView state
 */
export function useLazyImage(
	options: UseLazyImageOptions = {},
): UseLazyImageReturn {
	const { rootMargin = "100px" } = options;
	const [isInView, setIsInView] = useState(false);
	const ref = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsInView(true);
					observer.disconnect();
				}
			},
			{ rootMargin },
		);

		observer.observe(element);
		return () => observer.disconnect();
	}, [rootMargin]);

	return { ref, isInView };
}
