/**
 * Centralized error handling hook with toast notifications
 */

import { useCallback } from "react";
import { toast } from "sonner";
import {
	type ClassifiedError,
	classifyError,
} from "../lib/error-classification";

export interface ErrorHandlerOptions {
	/**
	 * Custom user-facing message (overrides classified message)
	 */
	customMessage?: string;

	/**
	 * Additional description/context to show below the main message
	 */
	description?: string;

	/**
	 * Whether to show a retry button
	 */
	showRetry?: boolean;

	/**
	 * Retry callback function
	 */
	onRetry?: () => void;

	/**
	 * Whether to log the error to console
	 */
	logError?: boolean;

	/**
	 * Duration in milliseconds (default: 5000 for errors)
	 */
	duration?: number;
}

export function useErrorHandler() {
	/**
	 * Handle an error with toast notification and optional retry
	 */
	const handleError = useCallback(
		(error: unknown, options: ErrorHandlerOptions = {}) => {
			const classified = classifyError(error);

			const {
				customMessage,
				description,
				showRetry = classified.retryable,
				onRetry,
				logError = true,
				duration = 5000,
			} = options;

			// Log to console for debugging
			if (logError) {
				console.error(
					"[Error Handler]",
					classified.message,
					classified.originalError,
				);
			}

			// Show toast notification
			toast.error(customMessage || classified.userMessage, {
				description,
				duration,
				action:
					showRetry && onRetry
						? {
								label: "Retry",
								onClick: onRetry,
							}
						: undefined,
			});

			return classified;
		},
		[],
	);

	/**
	 * Handle async operations with automatic error handling
	 */
	const handleAsyncError = useCallback(
		async <T>(
			promise: Promise<T>,
			options: ErrorHandlerOptions = {},
		): Promise<{ data: T | null; error: ClassifiedError | null }> => {
			try {
				const data = await promise;
				return { data, error: null };
			} catch (err) {
				const classified = handleError(err, options);
				return { data: null, error: classified };
			}
		},
		[handleError],
	);

	/**
	 * Wrap an async function with error handling and retry logic
	 */
	const withRetry = useCallback(
		<T extends unknown[], R>(
			fn: (...args: T) => Promise<R>,
			maxRetries = 3,
			options: ErrorHandlerOptions = {},
		) => {
			return async (...args: T): Promise<R> => {
				let lastError: unknown;

				for (let attempt = 0; attempt < maxRetries; attempt++) {
					try {
						return await fn(...args);
					} catch (err) {
						lastError = err;
						const classified = classifyError(err);

						// Don't retry if error is not retryable
						if (!classified.retryable) {
							handleError(err, options);
							throw err;
						}

						// Don't show error for retries (except last one)
						if (attempt < maxRetries - 1) {
							console.warn(
								`[Retry ${attempt + 1}/${maxRetries}]`,
								classified.message,
							);
							// Exponential backoff
							await new Promise((resolve) =>
								setTimeout(resolve, 2 ** attempt * 1000),
							);
						}
					}
				}

				// All retries failed
				handleError(lastError, options);
				throw lastError;
			};
		},
		[handleError],
	);

	return {
		handleError,
		handleAsyncError,
		withRetry,
	};
}
