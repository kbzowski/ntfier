import { memo } from "react";
import { Badge } from "@/components/ui/badge";

interface NotificationTagsProps {
	tags: string[];
}

export const NotificationTags = memo(function NotificationTags({
	tags,
}: NotificationTagsProps) {
	if (tags.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1.5 mt-3">
			{tags.map((tag) => (
				<Badge
					key={tag}
					variant="secondary"
					className="text-xs font-normal px-2 py-0.5"
				>
					{tag}
				</Badge>
			))}
		</div>
	);
});
