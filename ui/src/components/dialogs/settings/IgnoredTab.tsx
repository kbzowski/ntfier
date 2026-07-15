import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/context/AppContext";

export function IgnoredTab() {
	const { ignoreRules, addIgnoreRule, deleteIgnoreRule, subscriptions } =
		useApp();
	const [pattern, setPattern] = useState("");

	const topicNames = useMemo(() => {
		const map = new Map<string, string>();
		for (const sub of subscriptions) {
			map.set(sub.id, sub.displayName || sub.topic);
		}
		return map;
	}, [subscriptions]);

	const handleAdd = async () => {
		const trimmed = pattern.trim();
		if (!trimmed) return;
		await addIgnoreRule(trimmed, null);
		setPattern("");
	};

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Messages whose title contains one of these fragments are hidden from the
				list and never raise a notification. Matching ignores letter case.
				Removing a rule brings its messages back.
			</p>

			<div className="flex gap-2">
				<Input
					value={pattern}
					onChange={(e) => setPattern(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleAdd();
					}}
					placeholder="Title fragment to ignore"
					aria-label="Title fragment to ignore"
				/>
				<Button onClick={handleAdd} disabled={!pattern.trim()}>
					Add
				</Button>
			</div>

			{ignoreRules.length === 0 ? (
				<p className="text-sm text-muted-foreground">No ignore rules yet.</p>
			) : (
				<ul className="space-y-1">
					{ignoreRules.map((rule) => (
						<li
							key={rule.id}
							className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
						>
							<div className="min-w-0">
								<div className="truncate text-sm">{rule.pattern}</div>
								<div className="text-xs text-muted-foreground">
									{rule.subscriptionId
										? (topicNames.get(rule.subscriptionId) ?? "Unknown topic")
										: "All topics"}
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => deleteIgnoreRule(rule.id)}
								aria-label={`Delete rule ${rule.pattern}`}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
