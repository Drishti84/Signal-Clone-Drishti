import { AVATAR_MAX_BYTES } from "@/lib/constants";

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Crop a photo to a centred square, shrink it, and compress it as JPEG
 * until it fits the server's limit. Rejects if the file is not an image. */
export async function resizeToSquare(
  file: File,
  size = 256,
  maxBytes = AVATAR_MAX_BYTES,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn't an image we can read");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser can't process images");
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, size, size,
  );
  bitmap.close();

  for (let quality = 0.9; quality >= 0.3; quality -= 0.1) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error("That photo is too large, try another one");
}
