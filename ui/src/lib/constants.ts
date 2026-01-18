export const PRIORITY_CONFIG: Record<
	number,
	{
		label: string;
		borderClass: string;
		badgeClass: string;
	}
> = {
	1: {
		label: "Min",
		borderClass: "border-l-muted-foreground/30",
		badgeClass: "bg-muted text-muted-foreground border-muted hover:bg-muted/80",
	},
	2: {
		label: "Low",
		borderClass: "border-l-blue-500",
		badgeClass:
			"bg-blue-500/20 text-blue-500 border-blue-500/30 hover:bg-blue-500/30",
	},
	3: {
		label: "Default",
		borderClass: "",
		badgeClass: "",
	},
	4: {
		label: "High",
		borderClass: "border-l-orange-500",
		badgeClass:
			"bg-orange-500/20 text-orange-500 border-orange-500/30 hover:bg-orange-500/30",
	},
	5: {
		label: "Urgent",
		borderClass: "border-l-red-500",
		badgeClass:
			"bg-red-500/20 text-red-500 border-red-500/30 hover:bg-red-500/30",
	},
} as const;

export const DEFAULT_SERVER_URL = "https://ntfy.sh";
