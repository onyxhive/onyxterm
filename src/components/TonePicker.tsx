import { COLOR_TONE_CLASS, COLOR_TONES, type ColorTone } from "../colorTones";
import { cn, FOCUS_RING } from "./ui";

interface TonePickerProps {
  selected: ColorTone;
  label: string;
  onPick: (tone: ColorTone) => void;
}

export function TonePicker({ selected, label, onPick }: TonePickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 items-center gap-1">
      {COLOR_TONES.map((tone) => (
        <button
          key={tone}
          type="button"
          role="radio"
          aria-checked={tone === selected}
          aria-label={tone}
          title={tone}
          onClick={() => onPick(tone)}
          className={cn(
            "flex size-4 cursor-pointer items-center justify-center rounded-full aria-checked:ring-2",
            "aria-checked:ring-current",
            COLOR_TONE_CLASS[tone],
            FOCUS_RING,
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
        </button>
      ))}
    </div>
  );
}
