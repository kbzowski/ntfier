export interface SettingsSearch {
	editServer?: string;
}

export function validateSettingsSearch(
	search: Record<string, unknown>,
): SettingsSearch {
	const { editServer } = search;
	if (typeof editServer !== "string" || !URL.canParse(editServer)) return {};
	return { editServer };
}
