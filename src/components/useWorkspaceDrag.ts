import { useState, type DragEvent } from "react";

const DRAG_FORMAT = "text/plain";

interface WorkspaceDragInput {
  workspaceIds: string[];
  onReorder: (workspaceIds: string[]) => void;
}

function movedTo(workspaceIds: string[], draggedId: string, dropIndex: number): string[] {
  const remaining = workspaceIds.filter((workspaceId) => workspaceId !== draggedId);
  const insertAt = dropIndex > workspaceIds.indexOf(draggedId) ? dropIndex - 1 : dropIndex;
  return [...remaining.slice(0, insertAt), draggedId, ...remaining.slice(insertAt)];
}

function isLowerHalf(event: DragEvent<HTMLElement>): boolean {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY > bounds.top + bounds.height / 2;
}

export function useWorkspaceDrag({ workspaceIds, onReorder }: WorkspaceDragInput) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const draggedIndex = draggedId ? workspaceIds.indexOf(draggedId) : -1;
  const isMeaningfulDrop = dropIndex !== null && dropIndex !== draggedIndex && dropIndex !== draggedIndex + 1;

  function reset() {
    setDraggedId(null);
    setDropIndex(null);
  }

  function sourceProps(workspaceId: string) {
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(DRAG_FORMAT, workspaceId);
        setDraggedId(workspaceId);
      },
      onDragEnd: reset,
    };
  }

  function targetProps(index: number) {
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!draggedId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropIndex(isLowerHalf(event) ? index + 1 : index);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!draggedId || dropIndex === null) return;
        event.preventDefault();
        if (isMeaningfulDrop) onReorder(movedTo(workspaceIds, draggedId, dropIndex));
        reset();
      },
    };
  }

  function indicatorAt(index: number): "before" | "after" | null {
    if (!isMeaningfulDrop) return null;
    if (dropIndex === index) return "before";
    if (dropIndex === workspaceIds.length && index === workspaceIds.length - 1) return "after";
    return null;
  }

  return { draggedId, sourceProps, targetProps, indicatorAt };
}
