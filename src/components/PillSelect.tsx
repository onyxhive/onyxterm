import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

interface PillSelectProps {
  label: string;
  icon: ReactNode;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export function PillSelect({ label, icon, value, options, onChange }: PillSelectProps) {
  return (
    <label className="pill-select" title={label}>
      {icon}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pill-select__chevron" />
    </label>
  );
}
