import { File, FileCode, FileImage, FileJson, FileText, Folder, FolderOpen } from "lucide-react";
import { cn } from "./ui";

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "py", "go", "css", "scss", "html", "sh", "zsh", "sql", "swift",
  "java", "kt", "c", "h", "cpp", "hpp", "rb", "toml", "yml", "yaml", "xml",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "icns", "bmp"]);
const TEXT_EXTENSIONS = new Set(["md", "mdx", "txt", "rst", "log"]);
const JSON_EXTENSIONS = new Set(["json", "jsonc", "lock"]);

function extensionOf(name: string): string {
  return name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
}

function iconFor(name: string) {
  const extension = extensionOf(name);
  if (CODE_EXTENSIONS.has(extension)) return FileCode;
  if (IMAGE_EXTENSIONS.has(extension)) return FileImage;
  if (JSON_EXTENSIONS.has(extension)) return FileJson;
  if (TEXT_EXTENSIONS.has(extension)) return FileText;
  return File;
}

export function FileIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconFor(name);
  return <Icon aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground/80", className)} />;
}

export function FolderIcon({ isOpen }: { isOpen: boolean }) {
  const Icon = isOpen ? FolderOpen : Folder;
  return <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground/80" />;
}
