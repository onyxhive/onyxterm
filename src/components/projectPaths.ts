import { createContext, useContext } from "react";
import type { Task } from "../types";

export const ProjectRootsContext = createContext<string[]>([]);

const TRAILING_SLASHES = /\/+$/;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const PATH_END = "(?=$|[\\s\"'`;:,)\\]])";

function escaped(text: string): string {
  return text.replace(REGEX_SPECIALS, "\\$&");
}

function shortenedUnder(text: string, root: string): string {
  const base = escaped(root.replace(TRAILING_SLASHES, ""));
  return text.replace(new RegExp(`${base}/`, "g"), "").replace(new RegExp(`${base}${PATH_END}`, "g"), ".");
}

export function shortenPaths(text: string, roots: string[]): string {
  return roots.filter(Boolean).reduce(shortenedUnder, text);
}

export function useShortPaths(): (text: string) => string {
  const roots = useContext(ProjectRootsContext);
  return (text) => shortenPaths(text, roots);
}

export function projectRootsOf(task: Task, projectPath: string | null): string[] {
  return [task.worktreePath, projectPath].filter((root): root is string => root !== null);
}
