import type { ReactNode } from "react";
import { Checkbox } from "./checkbox";

interface SettingCheckboxProps {
	id: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: ReactNode;
	description?: string;
	icon?: ReactNode;
	disabled?: boolean;
	className?: string;
}

export function SettingCheckbox({
	id,
	checked,
	onCheckedChange,
	label,
	description,
	icon,
	disabled,
	className,
}: SettingCheckboxProps) {
	return (
		<div className={className}>
			<div className="flex items-center gap-2">
				<Checkbox
					id={id}
					checked={checked}
					onCheckedChange={(value) => onCheckedChange(value === true)}
					disabled={disabled}
				/>
				<label
					htmlFor={id}
					className="flex items-center gap-2 text-sm font-medium cursor-pointer"
				>
					{icon}
					{label}
				</label>
			</div>
			{description && (
				<p className="text-xs text-muted-foreground pl-6 mt-1">{description}</p>
			)}
		</div>
	);
}
