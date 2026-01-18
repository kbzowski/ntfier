import {
	AlertTriangle,
	ArrowDown,
	ArrowDownRight,
	ArrowUpRight,
	type LucideIcon,
	Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface PriorityBadgeProps {
	priority: number;
	className?: string;
}

const PRIORITY_ICONS: Record<number, LucideIcon> = {
	1: ArrowDown,
	2: ArrowDownRight,
	3: Minus,
	4: ArrowUpRight,
	5: AlertTriangle,
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
	if (priority === 3) return null;

	const config = PRIORITY_CONFIG[priority];
	const Icon = PRIORITY_ICONS[priority];

	return (
		<Badge
			variant="outline"
			className={cn("gap-1 font-medium", config.badgeClass, className)}
		>
			<Icon className="h-3 w-3" />
			{config.label}
		</Badge>
	);
}
