export const COLOR_TONES = ["sky", "violet", "emerald", "amber", "rose", "teal", "indigo", "orange"] as const;

export type ColorTone = (typeof COLOR_TONES)[number];

export const COLOR_TONE_CLASS: Record<ColorTone, string> = {
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};
