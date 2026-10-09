/**
 * @module hooks/useServerForm
 *
 * Manages the server configuration form state and submission logic.
 */

import { useCallback, useState } from "react";
import { getErrorMessage } from "@/lib/error-classification";
import type { ServerConfig } from "@/types/ntfy";

export type AuthMode = "none" | "password" | "token";

export type ServerInput = Omit<ServerConfig, "isDefault">;

interface UseServerFormOptions {
	onAdd: (server: ServerInput) => Promise<unknown>;
	onUpdate: (server: ServerInput) => Promise<unknown>;
	/** Server whose login the form starts out editing. */
	initial?: ServerConfig;
}

/** The URL of the server being edited, or `null` when adding a new one. */
type FormMode = { editing: string | null } | null;

function authModeOf(server: ServerConfig): AuthMode {
	if (server.username) return "password";
	if (server.token) return "token";
	return "none";
}

/**
 * Hook for the server form: add a server, or edit the login of an existing one
 * (the URL can't change). One credential per server: password or access token.
 */
export function useServerForm({
	onAdd,
	onUpdate,
	initial,
}: UseServerFormOptions) {
	const [mode, setMode] = useState<FormMode>(
		initial ? { editing: initial.url } : null,
	);
	const [url, setUrl] = useState(initial?.url ?? "");
	const [authMode, setAuthMode] = useState<AuthMode>(
		initial ? authModeOf(initial) : "none",
	);
	const [username, setUsername] = useState(initial?.username ?? "");
	const [password, setPassword] = useState(initial?.password ?? "");
	const [token, setToken] = useState(initial?.token ?? "");
	const [showSecret, setShowSecret] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fill = useCallback((server: ServerConfig | null) => {
		setUrl(server?.url ?? "");
		setAuthMode(server ? authModeOf(server) : "none");
		setUsername(server?.username ?? "");
		setPassword(server?.password ?? "");
		setToken(server?.token ?? "");
		setShowSecret(false);
	}, []);

	const startAdding = useCallback(() => {
		fill(null);
		setMode({ editing: null });
	}, [fill]);

	const startEditing = useCallback(
		(server: ServerConfig) => {
			fill(server);
			setMode({ editing: server.url });
		},
		[fill],
	);

	const cancel = useCallback(() => {
		setMode(null);
		fill(null);
	}, [fill]);

	const toggleShowSecret = useCallback(() => {
		setShowSecret((prev) => !prev);
	}, []);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	const credentialComplete =
		authMode === "none" ||
		(authMode === "password" && !!username.trim() && !!password) ||
		(authMode === "token" && !!token.trim());

	const handleSubmit = useCallback(async () => {
		if (!url.trim() || !mode || !credentialComplete) return;

		setIsLoading(true);
		setError(null);

		const server: ServerInput = {
			url: url.trim(),
			username: authMode === "password" ? username.trim() : null,
			password: authMode === "password" ? password : null,
			token: authMode === "token" ? token.trim() : null,
		};

		try {
			await (mode.editing ? onUpdate(server) : onAdd(server));
			setMode(null);
			fill(null);
		} catch (err) {
			console.error("Failed to save server:", err);
			setError(getErrorMessage(err));
		} finally {
			setIsLoading(false);
		}
	}, [
		url,
		mode,
		credentialComplete,
		authMode,
		username,
		password,
		token,
		onAdd,
		onUpdate,
		fill,
	]);

	return {
		formData: { url, authMode, username, password, token },
		setUrl,
		setAuthMode,
		setUsername,
		setPassword,
		setToken,
		showSecret,
		toggleShowSecret,
		isOpen: mode !== null,
		editingUrl: mode?.editing ?? null,
		startAdding,
		startEditing,
		cancel,
		isLoading,
		error,
		clearError,
		handleSubmit,
		canSubmit: !!url.trim() && credentialComplete && !isLoading,
	};
}
