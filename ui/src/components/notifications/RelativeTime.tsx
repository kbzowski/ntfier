import { useNow } from "@/hooks/useNow";

export function formatTimestamp(timestamp: number, now: number): string {
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;

	return new Date(timestamp).toLocaleDateString();
}

export function RelativeTime({
	timestamp,
	className,
}: {
	timestamp: number;
	className?: string;
}) {
	const now = useNow();
	const date = new Date(timestamp);
	return (
		<time
			dateTime={date.toISOString()}
			title={date.toLocaleString()}
			className={className}
		>
			{formatTimestamp(timestamp, now)}
		</time>
	);
}
