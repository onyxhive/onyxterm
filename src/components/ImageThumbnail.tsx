import { useState } from "react";
import { X } from "lucide-react";
import { imageSourceOf } from "../imageAttachments";
import type { ImageAttachment } from "../types";
import { Dialog } from "./Dialog";
import { cn } from "./ui";

const IMAGE_LABEL = "Image";

interface ImageThumbnailProps {
  image: ImageAttachment;
  className?: string;
  onRemove?: () => void;
}

export function ImageThumbnail({ image, className, onRemove }: ImageThumbnailProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const label = image.name ?? IMAGE_LABEL;

  return (
    <span className={cn("group/thumb relative inline-flex shrink-0", className)}>
      <button
        type="button"
        aria-label={`Preview ${label}`}
        title={label}
        className="size-full cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted"
        onClick={() => setIsPreviewOpen(true)}
      >
        <img src={imageSourceOf(image)} alt={label} className="size-full object-cover" />
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          className={cn(
            "absolute -top-1.5 -right-1.5 flex size-4.5 cursor-pointer items-center justify-center rounded-full",
            "border border-border bg-card text-muted-foreground shadow-xs hover:text-foreground",
          )}
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      )}
      {isPreviewOpen && (
        <Dialog title={label} onClose={() => setIsPreviewOpen(false)} className="max-w-3xl">
          <div className="px-5 pb-5">
            <img src={imageSourceOf(image)} alt={label} className="max-h-[70vh] w-full rounded-lg object-contain" />
          </div>
        </Dialog>
      )}
    </span>
  );
}
