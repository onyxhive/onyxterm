import { useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { ghProblemOf, prApi, type GitTarget } from "../gitApi";
import type { PullRequestDetail } from "../types";
import { Dialog } from "./Dialog";
import { GhProblemState } from "./GhProblemState";
import { cn, GHOST_BUTTON, PRIMARY_BUTTON, TEXT_INPUT } from "./ui";

interface CreatePrDialogProps {
  target: GitTarget;
  initialTitle: string;
  onClose: () => void;
}

const FIELD_LABEL = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

function CreatedPr({ pr, onClose }: { pr: PullRequestDetail; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4 px-5 pb-5">
      <p className="text-sm text-foreground/85">
        Opened pull request <span className="font-medium text-foreground">#{pr.number}</span> {pr.title}.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className={GHOST_BUTTON} onClick={onClose}>
          Done
        </button>
        <button type="button" className={PRIMARY_BUTTON} onClick={() => void openUrl(pr.url)}>
          <ExternalLink />
          Open on GitHub
        </button>
      </div>
    </div>
  );
}

export function CreatePrDialog({ target, initialTitle, onClose }: CreatePrDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState("");
  const [base, setBase] = useState("");
  const [isDraft, setIsDraft] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<PullRequestDetail | null>(null);
  const ghProblem = error ? ghProblemOf(error) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      const draft = { title: title.trim(), body, base: base.trim() || null, draft: isDraft };
      setCreated(await prApi.create(target, draft));
    } catch (failure) {
      setError(failure);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Dialog title="Create pull request" description="Opens a pull request for the current branch." onClose={onClose}>
      {created && <CreatedPr pr={created} onClose={onClose} />}
      {!created && ghProblem && <GhProblemState problem={ghProblem} onRetry={() => setError(null)} className="py-6" />}
      {!created && !ghProblem && (
        <form onSubmit={submit} className="flex flex-col gap-3 px-5 pb-5">
          <label className={FIELD_LABEL}>
            Title
            <input
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={TEXT_INPUT}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className={FIELD_LABEL}>
            Description
            <textarea
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              rows={6}
              placeholder="What changed and how to test it. Markdown works."
              className={cn(TEXT_INPUT, "h-auto resize-y py-2 leading-5")}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <div className="flex items-end gap-3">
            <label className={cn(FIELD_LABEL, "flex-1")}>
              Base branch
              <input
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={cn(TEXT_INPUT, "font-mono text-xs")}
                placeholder="Repository default"
                value={base}
                onChange={(event) => setBase(event.target.value)}
              />
            </label>
            <label className="flex h-8 cursor-pointer items-center gap-2 text-sm text-foreground/85">
              <input
                type="checkbox"
                className="size-4 accent-(--primary)"
                checked={isDraft}
                onChange={(event) => setIsDraft(event.target.checked)}
              />
              Draft
            </label>
          </div>
          {error !== null && <p role="alert" className="text-xs text-error-foreground">{String(error)}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={GHOST_BUTTON} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={PRIMARY_BUTTON} disabled={!title.trim() || isBusy}>
              {isDraft ? "Create draft PR" : "Create PR"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
