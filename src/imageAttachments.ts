import type { ImageAttachment } from "./types";

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const MAX_IMAGES = 10;
export const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DATA_URL_PREFIX = /^data:[^;]+;base64,/;
const BASE64_BYTES_PER_CHAR = 3 / 4;

export function isImageFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

export function imageProblemOf(file: File): string | null {
  if (!isImageFile(file)) return `${file.name} is not a PNG, JPEG, GIF or WebP image`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name} is larger than 5 MB`;
  return null;
}

export function readImage(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataBase64 = String(reader.result).replace(DATA_URL_PREFIX, "");
      resolve({ mediaType: file.type, dataBase64, name: file.name });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function imageSourceOf(image: ImageAttachment): string {
  return `data:${image.mediaType};base64,${image.dataBase64}`;
}

export function byteSizeOf(image: ImageAttachment): number {
  return Math.floor(image.dataBase64.length * BASE64_BYTES_PER_CHAR);
}
