import type { ModelOption } from "./agentEvents";
import { FALLBACK_EFFORTS, FALLBACK_MODELS } from "./agentOptions";
import type { ModelChoice } from "./components/ComposerControls";

const RECOMMENDED_SUFFIX = /\s*\(recommended\)\s*$/i;

export function effortOptionsFor(model: ModelOption | undefined): string[] {
  if (!model) return FALLBACK_EFFORTS;
  return model.supportsEffort ? model.supportedEffortLevels : [];
}

export function pickOption(options: string[], preferred: string, fallback: string): string {
  if (options.includes(preferred)) return preferred;
  if (options.includes(fallback)) return fallback;
  return options[0] ?? "";
}

function modelLabel(model: ModelOption): string {
  return model.displayName.replace(RECOMMENDED_SUFFIX, "");
}

export function modelChoices(models: ModelOption[]): ModelChoice[] {
  if (models.length === 0) return FALLBACK_MODELS.map((value) => ({ value, label: value, description: "" }));
  return models.map((model) => ({ value: model.value, label: modelLabel(model), description: model.description }));
}
