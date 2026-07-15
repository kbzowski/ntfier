import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";
import type { Notification } from "@/types/bindings";

interface IgnoreRuleDialogProps {
	notification: Notification;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function IgnoreRuleDialog({
	notification,
	open,
	onOpenChange,
}: IgnoreRuleDialogProps) {
	const { addIgnoreRule } = useApp();
	const [pattern, setPattern] = useState(notification.title);
	const [thisTopicOnly, setThisTopicOnly] = useState(false);

	useEffect(() => {
		if (open) {
			setPattern(notification.title);
			setThisTopicOnly(false);
		}
	}, [open, notification.title]);

	const handleSave = async () => {
		const trimmed = pattern.trim();
		if (!trimmed) return;
		await addIgnoreRule(trimmed, thisTopicOnly ? notification.topicId : null);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Ignore similar messages</DialogTitle>
					<DialogDescription>
						Trim this down to the part that repeats. Messages whose title
						contains it are hidden from the list.
					</DialogDescription>
				</DialogHeader>

				<Input
					value={pattern}
					onChange={(e) => setPattern(e.target.value)}
					aria-label="Title fragment to ignore"
				/>

				<div className="flex items-center gap-2">
					<Checkbox
						id="ignore-this-topic-only"
						checked={thisTopicOnly}
						onCheckedChange={(checked) => setThisTopicOnly(checked === true)}
					/>
					<Label htmlFor="ignore-this-topic-only">Only in this topic</Label>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!pattern.trim()}>
						Ignore
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
