import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { mockSettings } from "@/data/mock-data";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { classifyError } from "@/lib/error-classification";
import {
	autostartApi,
	ignoreRulesApi,
	isTauri,
	settingsApi,
	syncApi,
} from "@/lib/tauri";
import type { IgnoreRule, ServerStatusEntry } from "@/types/bindings";
import type {
	AppSettings,
	NotificationDisplayMethod,
	ServerConfig,
	UpdateInfo,
} from "@/types/ntfy";

/** What the window hosting the settings does on a save from any window. */
export interface SettingsCallbacks {
	onIgnoreRulesChanged?: () => Promise<void>;
	onServerRemoved?: (url: string) => void;
}

export interface SettingsState {
	settings: AppSettings;
	settingsLoading: boolean;
	/** Startup load failure of the settings part */
	settingsLoadError: string | null;
	ignoreRules: IgnoreRule[];
	autostart: boolean;
	updateInfo: UpdateInfo | null;
	// Servers blocked from connecting, and per-subscription connection errors
	serverStatuses: ServerStatusEntry[];

	reloadSettings: () => Promise<void>;

	// Ignore rules
	addIgnoreRule: (
		pattern: string,
		subscriptionId: string | null,
	) => Promise<void>;
	deleteIgnoreRule: (id: string) => Promise<void>;

	// Servers
	addServer: (server: Omit<ServerConfig, "isDefault">) => Promise<void>;
	updateServer: (server: Omit<ServerConfig, "isDefault">) => Promise<void>;
	syncServer: (url: string) => Promise<void>;
	removeServer: (url: string) => Promise<void>;
	setDefaultServer: (url: string) => Promise<void>;

	// Startup
	setAutostart: (enabled: boolean) => Promise<void>;
	setMinimizeToTray: (enabled: boolean) => Promise<void>;
	setStartMinimized: (enabled: boolean) => Promise<void>;

	// Notification settings
	setNotificationMethod: (method: NotificationDisplayMethod) => Promise<void>;
	setNotificationForceDisplay: (enabled: boolean) => Promise<void>;
	setNotificationShowActions: (enabled: boolean) => Promise<void>;
	setNotificationShowImages: (enabled: boolean) => Promise<void>;
	setNotificationSound: (enabled: boolean) => Promise<void>;

	// Message display settings
	setCompactView: (enabled: boolean) => Promise<void>;
	setExpandNewMessages: (enabled: boolean) => Promise<void>;

	// Deletion settings
	setDeleteLocalOnly: (enabled: boolean) => Promise<void>;
	setRetentionMaxAgeDays: (days: number | null) => Promise<void>;
	setRetentionMaxPerSubscription: (max: number | null) => Promise<void>;

	// Favorites settings
	setFavoritesEnabled: (enabled: boolean) => Promise<void>;

	// Updates
	setUpdateInfo: (info: UpdateInfo | null) => void;
}

const emptySettings: AppSettings = { ...mockSettings, servers: [] };

type SetSettings = Dispatch<SetStateAction<AppSettings>>;

/**
 * Factory for boolean setting setters that follow the same pattern:
 * call API → update local state → show toast → handle errors.
 */
function makeBooleanSettingSetter(
	setSettings: SetSettings,
	key: keyof AppSettings,
	apiCall: (enabled: boolean) => Promise<unknown>,
	label?: string,
): (enabled: boolean) => Promise<void> {
	return async (enabled: boolean) => {
		if (!isTauri()) return;
		try {
			await apiCall(enabled);
			setSettings((prev) => ({ ...prev, [key]: enabled }));
			if (label) toast.success(`${label} ${enabled ? "enabled" : "disabled"}`);
		} catch (err) {
			const classified = classifyError(err);
			toast.error(classified.userMessage);
			console.error("[Settings Error]", err);
		}
	};
}

/** Creates a setter for an optional limit setting (`null` = off). */
function makeLimitSettingSetter(
	setSettings: SetSettings,
	key: keyof AppSettings,
	apiCall: (limit: number | null) => Promise<unknown>,
): (limit: number | null) => Promise<void> {
	return async (limit: number | null) => {
		if (!isTauri()) return;
		try {
			await apiCall(limit);
			setSettings((prev) => ({ ...prev, [key]: limit }));
		} catch (err) {
			const classified = classifyError(err);
			toast.error(classified.userMessage);
			console.error("[Settings Error]", err);
		}
	};
}

/**
 * Settings state of one window: loads it, saves changes with toasts and
 * listens for `settings:*`, `server:status` and `update:available`, so a
 * save in one window reaches the others. Works without `AppProvider`.
 */
export function useSettings(callbacks: SettingsCallbacks = {}): SettingsState {
	const [settings, setSettings] = useState<AppSettings>(() =>
		isTauri() ? emptySettings : mockSettings,
	);
	const [settingsLoading, setSettingsLoading] = useState(true);
	const [settingsLoadError, setSettingsLoadError] = useState<string | null>(
		null,
	);
	const [ignoreRules, setIgnoreRules] = useState<IgnoreRule[]>([]);
	const [autostart, setAutostartState] = useState(false);
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
	const [serverStatuses, setServerStatuses] = useState<ServerStatusEntry[]>([]);

	// Latest callbacks without making every action depend on them
	const callbacksRef = useRef(callbacks);
	useEffect(() => {
		callbacksRef.current = callbacks;
	});

	const refreshIgnoreRules = useCallback(async () => {
		try {
			if (isTauri()) {
				setIgnoreRules(await ignoreRulesApi.getAll());
			}
		} catch (err) {
			console.error("Failed to refresh ignore rules:", err);
		}
	}, []);

	const reloadSettings = useCallback(async () => {
		setSettingsLoadError(null);
		try {
			if (isTauri()) {
				const [loadedSettings, autostartEnabled, statuses] = await Promise.all([
					settingsApi.get(),
					autostartApi.isEnabled(),
					settingsApi.getServerStatuses(),
				]);
				setSettings(loadedSettings);
				setAutostartState(autostartEnabled);
				setServerStatuses(statuses);
			} else {
				setSettings(mockSettings);
			}
		} catch (err) {
			console.error("Failed to load initial data:", err);
			setSettingsLoadError(classifyError(err).userMessage);
		} finally {
			setSettingsLoading(false);
		}
	}, []);

	useEffect(() => {
		reloadSettings();
		refreshIgnoreRules();
	}, [reloadSettings, refreshIgnoreRules]);

	useTauriEvent<ServerStatusEntry>(
		"server:status",
		useCallback((entry: ServerStatusEntry) => {
			setServerStatuses((prev) => [
				...prev.filter((s) => s.url !== entry.url),
				...(entry.status.kind === "ok" ? [] : [entry]),
			]);
		}, []),
	);

	useTauriEvent<void>(
		"settings:changed",
		useCallback(async () => {
			try {
				setSettings(await settingsApi.get());
			} catch (err) {
				console.error("Failed to refetch settings:", err);
			}
		}, []),
	);

	useTauriEvent<void>(
		"settings:ignore-rules-changed",
		useCallback(async () => {
			await refreshIgnoreRules();
			await callbacksRef.current.onIgnoreRulesChanged?.();
		}, [refreshIgnoreRules]),
	);

	useTauriEvent<{ url: string }>(
		"settings:server-removed",
		useCallback(({ url }: { url: string }) => {
			callbacksRef.current.onServerRemoved?.(url);
		}, []),
	);

	// Listen for update:available event (from startup update check)
	useTauriEvent<UpdateInfo>(
		"update:available",
		useCallback((info: UpdateInfo) => {
			console.log("Update available:", info.version);
			setUpdateInfo(info);
		}, []),
	);

	const addIgnoreRule = useCallback(
		async (pattern: string, subscriptionId: string | null) => {
			if (isTauri()) {
				try {
					await ignoreRulesApi.add(pattern, subscriptionId);
				} catch (err) {
					const classified = classifyError(err);
					toast.error(classified.userMessage, {
						description: "Failed to add ignore rule",
					});
					console.error("[Add ignore rule error]", err);
				}
			}
		},
		[],
	);

	const deleteIgnoreRule = useCallback(async (id: string) => {
		if (isTauri()) {
			try {
				await ignoreRulesApi.delete(id);
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Failed to delete ignore rule",
				});
				console.error("[Delete ignore rule error]", err);
			}
		}
	}, []);

	const addServer = useCallback(
		async (server: Omit<ServerConfig, "isDefault">) => {
			if (isTauri()) {
				const saved = await settingsApi.addServer(server);
				if (saved.warning) toast.warning(saved.warning);
				const loaded = await settingsApi.get();
				setSettings(loaded);
				const added = loaded.servers.find((s) => s.url === saved.url);

				// With a login, bring in the account's topics (every window refreshes on
				// `subscriptions:synced`). The server stays saved if that fails; the
				// sync button retries it.
				if (added && (added.username || added.token)) {
					try {
						await syncApi.syncSubscriptions(saved.url);
					} catch (err) {
						toast.error("Server added, but syncing its topics failed", {
							description: classifyError(err).userMessage,
						});
					}
				}
				return;
			}
			const newServer: ServerConfig = { ...server, isDefault: false };
			setSettings((prev) => ({
				...prev,
				servers: [...prev.servers, newServer],
			}));
		},
		[],
	);

	const updateServer = useCallback(
		async (server: Omit<ServerConfig, "isDefault">) => {
			if (!isTauri()) return;
			const saved = await settingsApi.updateServer(server);
			if (saved.warning) toast.warning(saved.warning);
			else toast.success("Login updated");
		},
		[],
	);

	const syncServer = useCallback(async (url: string) => {
		if (!isTauri()) return;
		try {
			const subs = await syncApi.syncSubscriptions(url);
			toast.success(
				`Synced ${subs.length} topic${subs.length === 1 ? "" : "s"}`,
			);
		} catch (err) {
			toast.error(classifyError(err).userMessage, {
				description: "Sync failed",
			});
		}
	}, []);

	const removeServer = useCallback(async (url: string) => {
		if (isTauri()) {
			try {
				await settingsApi.removeServer(url);
				toast.success("Server removed");
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage);
				console.error("[Settings Error]", err);
			}
		} else {
			setSettings((prev) => ({
				...prev,
				servers: prev.servers.filter((s) => s.url !== url),
			}));
		}
	}, []);

	const setDefaultServer = useCallback(async (url: string) => {
		if (isTauri()) {
			try {
				await settingsApi.setDefaultServer(url);
				setSettings((prev) => ({
					...prev,
					defaultServer: url,
					servers: prev.servers.map((s) => ({
						...s,
						isDefault: s.url === url,
					})),
				}));
				toast.success("Default server updated");
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage);
				console.error("[Settings Error]", err);
			}
		} else {
			setSettings((prev) => ({
				...prev,
				defaultServer: url,
				servers: prev.servers.map((s) => ({ ...s, isDefault: s.url === url })),
			}));
		}
	}, []);

	const setAutostart = useCallback(async (enabled: boolean) => {
		if (isTauri()) {
			try {
				if (enabled) {
					await autostartApi.enable();
				} else {
					await autostartApi.disable();
				}
				setAutostartState(enabled);
				toast.success(`Autostart ${enabled ? "enabled" : "disabled"}`);
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage, {
					description: "Check system permissions and try again",
				});
				console.error("[Autostart Error]", err);
			}
		}
	}, []);

	// Boolean settings setters - all follow the same pattern via factory
	const booleanSetters = useMemo(
		() => ({
			setMinimizeToTray: makeBooleanSettingSetter(
				setSettings,
				"minimizeToTray",
				settingsApi.setMinimizeToTray,
				"Minimize to tray",
			),
			setStartMinimized: makeBooleanSettingSetter(
				setSettings,
				"startMinimized",
				settingsApi.setStartMinimized,
				"Start minimized",
			),
			setNotificationForceDisplay: makeBooleanSettingSetter(
				setSettings,
				"notificationForceDisplay",
				settingsApi.setNotificationForceDisplay,
				"Force display",
			),
			setNotificationShowActions: makeBooleanSettingSetter(
				setSettings,
				"notificationShowActions",
				settingsApi.setNotificationShowActions,
				"Show actions",
			),
			setNotificationShowImages: makeBooleanSettingSetter(
				setSettings,
				"notificationShowImages",
				settingsApi.setNotificationShowImages,
				"Show images",
			),
			setNotificationSound: makeBooleanSettingSetter(
				setSettings,
				"notificationSound",
				settingsApi.setNotificationSound,
				"Notification sound",
			),
			setCompactView: makeBooleanSettingSetter(
				setSettings,
				"compactView",
				settingsApi.setCompactView,
				"Compact view",
			),
			setExpandNewMessages: makeBooleanSettingSetter(
				setSettings,
				"expandNewMessages",
				settingsApi.setExpandNewMessages,
				"Expand new messages",
			),
			setDeleteLocalOnly: makeBooleanSettingSetter(
				setSettings,
				"deleteLocalOnly",
				settingsApi.setDeleteLocalOnly,
				"Delete only locally",
			),
			setFavoritesEnabled: makeBooleanSettingSetter(
				setSettings,
				"favoritesEnabled",
				settingsApi.setFavoritesEnabled,
			),
			setRetentionMaxAgeDays: makeLimitSettingSetter(
				setSettings,
				"retentionMaxAgeDays",
				settingsApi.setRetentionMaxAgeDays,
			),
			setRetentionMaxPerSubscription: makeLimitSettingSetter(
				setSettings,
				"retentionMaxPerSubscription",
				settingsApi.setRetentionMaxPerSubscription,
			),
		}),
		[],
	);

	// Notification method uses a different type signature
	const setNotificationMethod = useCallback(
		async (method: NotificationDisplayMethod) => {
			if (!isTauri()) return;
			try {
				await settingsApi.setNotificationMethod(method);
				setSettings((prev) => ({ ...prev, notificationMethod: method }));
				toast.success("Notification method updated");
			} catch (err) {
				const classified = classifyError(err);
				toast.error(classified.userMessage);
				console.error("[Settings Error]", err);
			}
		},
		[],
	);

	return useMemo(
		() => ({
			settings,
			settingsLoading,
			settingsLoadError,
			ignoreRules,
			autostart,
			updateInfo,
			serverStatuses,
			reloadSettings,
			addIgnoreRule,
			deleteIgnoreRule,
			addServer,
			updateServer,
			syncServer,
			removeServer,
			setDefaultServer,
			setAutostart,
			setNotificationMethod,
			setUpdateInfo,
			...booleanSetters,
		}),
		[
			settings,
			settingsLoading,
			settingsLoadError,
			ignoreRules,
			autostart,
			updateInfo,
			serverStatuses,
			reloadSettings,
			addIgnoreRule,
			deleteIgnoreRule,
			addServer,
			updateServer,
			syncServer,
			removeServer,
			setDefaultServer,
			setAutostart,
			setNotificationMethod,
			booleanSetters,
		],
	);
}
