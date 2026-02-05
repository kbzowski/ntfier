/**
 * @module hooks/useServerForm
 *
 * Manages the server configuration form state and submission logic.
 */

import { useCallback, useState } from "react";
import { getErrorMessage } from "@/lib/error-classification";
import type { ServerConfig } from "@/types/ntfy";

interface ServerFormData {
	url: string;
	username: string;
	password: string;
}

interface UseServerFormOptions {
	onSubmit: (server: Omit<ServerConfig, "isDefault">) => Promise<unknown>;
}

interface UseServerFormReturn {
	formData: ServerFormData;
	setUrl: (url: string) => void;
	setUsername: (username: string) => void;
	setPassword: (password: string) => void;
	showPassword: boolean;
	toggleShowPassword: () => void;
	isAdding: boolean;
	startAdding: () => void;
	cancelAdding: () => void;
	isLoading: boolean;
	error: string | null;
	clearError: () => void;
	handleSubmit: () => Promise<void>;
	canSubmit: boolean;
}

/**
 * Hook for managing server configuration form state.
 *
 * Provides form data, validation, loading states, and error handling
 * for adding new ntfy servers.
 *
 * @param options.onSubmit - Callback to handle form submission
 */
export function useServerForm({
	onSubmit,
}: UseServerFormOptions): UseServerFormReturn {
	const [url, setUrl] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isAdding, setIsAdding] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const reset = useCallback(() => {
		setUrl("");
		setUsername("");
		setPassword("");
		setShowPassword(false);
	}, []);

	const startAdding = useCallback(() => {
		setIsAdding(true);
	}, []);

	const cancelAdding = useCallback(() => {
		setIsAdding(false);
		reset();
	}, [reset]);

	const toggleShowPassword = useCallback(() => {
		setShowPassword((prev) => !prev);
	}, []);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	const handleSubmit = useCallback(async () => {
		if (!url.trim()) return;

		setIsLoading(true);
		setError(null);

		try {
			await onSubmit({
				url: url.trim(),
				username: username.trim() || null,
				password: password || null,
			});

			reset();
			setIsAdding(false);
		} catch (err) {
			console.error("Failed to add server:", err);
			setError(getErrorMessage(err));
		} finally {
			setIsLoading(false);
		}
	}, [url, username, password, onSubmit, reset]);

	return {
		formData: { url, username, password },
		setUrl,
		setUsername,
		setPassword,
		showPassword,
		toggleShowPassword,
		isAdding,
		startAdding,
		cancelAdding,
		isLoading,
		error,
		clearError,
		handleSubmit,
		canSubmit: !!url.trim() && !isLoading,
	};
}
