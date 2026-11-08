import { useState } from "react";
import { byteSizeOf, imageProblemOf, MAX_IMAGES, MAX_TOTAL_IMAGE_BYTES, readImage } from "../imageAttachments";
import type { ImageAttachment } from "../types";

const TOO_MANY_IMAGES = `You can attach up to ${MAX_IMAGES} images`;
const TOO_LARGE_IN_TOTAL = "Images in one message can add up to 20 MB";

interface Admission {
  admitted: ImageAttachment[];
  problem: string | null;
}

function admit(current: ImageAttachment[], candidates: ImageAttachment[]): Admission {
  let total = current.reduce((sum, image) => sum + byteSizeOf(image), 0);
  const admitted: ImageAttachment[] = [];
  for (const candidate of candidates) {
    if (current.length + admitted.length >= MAX_IMAGES) return { admitted, problem: TOO_MANY_IMAGES };
    if (total + byteSizeOf(candidate) > MAX_TOTAL_IMAGE_BYTES) return { admitted, problem: TOO_LARGE_IN_TOTAL };
    total += byteSizeOf(candidate);
    admitted.push(candidate);
  }
  return { admitted, problem: null };
}

export function useImageAttachments() {
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  async function add(files: File[]) {
    const rejection = files.map(imageProblemOf).find((message) => message !== null) ?? null;
    const read = await Promise.all(files.filter((file) => imageProblemOf(file) === null).map(readImage));
    const admission = admit(images, read);
    setImages((current) => [...current, ...admission.admitted]);
    setProblem(admission.problem ?? rejection);
  }

  function remove(index: number) {
    setImages((current) => current.filter((_, at) => at !== index));
    setProblem(null);
  }

  function clear() {
    setImages([]);
    setProblem(null);
  }

  return { images, problem, add, remove, clear };
}
