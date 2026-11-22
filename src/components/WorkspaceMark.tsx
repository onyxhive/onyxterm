import { imageSourceOf } from "../imageAttachments";
import type { Workspace } from "../types";
import { cn } from "./ui";

const MARK_SIZE = {
  small: "size-5 rounded-md text-[11px]",
  large: "size-10 rounded-lg text-base",
};

interface WorkspaceMarkProps {
  workspace: Pick<Workspace, "name" | "logo">;
  size?: keyof typeof MARK_SIZE;
}

export function WorkspaceMark({ workspace, size = "small" }: WorkspaceMarkProps) {
  if (workspace.logo) {
    return (
      <img
        aria-hidden="true"
        alt=""
        draggable={false}
        src={imageSourceOf(workspace.logo)}
        className={cn("shrink-0 object-cover", MARK_SIZE[size])}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-foreground font-semibold text-background uppercase",
        MARK_SIZE[size],
      )}
    >
      {workspace.name.charAt(0)}
    </span>
  );
}
