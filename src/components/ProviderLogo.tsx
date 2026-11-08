import type { Provider } from "../types";
import { cn } from "./ui";

const CLAUDE_RAY_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const CLAUDE_RAY_LENGTHS = [7, 5.4, 6.4, 5, 7, 5.6, 6.2, 5.2, 6.8, 5.4, 6.4, 5];
const CODEX_PETAL_ANGLES = [0, 60, 120, 180, 240, 300];
const DEFAULT_SIZE = 16;

interface ProviderLogoProps {
  provider: Provider;
  size?: number;
  className?: string;
}

function ClaudeMark({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" className="shrink-0">
      <g stroke="var(--provider-claude)" strokeWidth={1.7} strokeLinecap="round">
        {CLAUDE_RAY_ANGLES.map((angle, index) => (
          <line
            key={angle}
            x1={8}
            y1={8}
            x2={8}
            y2={8 - CLAUDE_RAY_LENGTHS[index]}
            transform={`rotate(${angle} 8 8)`}
          />
        ))}
      </g>
    </svg>
  );
}

function CodexMark({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" className="shrink-0">
      <g fill="none" stroke="currentColor" strokeWidth={1.1}>
        {CODEX_PETAL_ANGLES.map((angle) => (
          <rect key={angle} x={6} y={1.6} width={4} height={8} rx={2} transform={`rotate(${angle} 8 8)`} />
        ))}
      </g>
    </svg>
  );
}

export function ProviderLogo({ provider, size = DEFAULT_SIZE, className }: ProviderLogoProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", className)} title={provider}>
      {provider === "Codex" ? <CodexMark size={size} /> : <ClaudeMark size={size} />}
    </span>
  );
}
