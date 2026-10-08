import { api } from "@/lib/api";
import { ATTACHMENT_MAX_BYTES } from "@/lib/constants";
import type { Attachment } from "@/lib/types";

// Files are private to a chat, so the browser cannot load them with a plain
// <img src>: that would not carry the login token. Each file is fetched once
// with the token and kept as a local object URL for this visit.
const urls = new Map<number, Promise<string>>();

export function attachmentUrl(id: number): Promise<string> {
  let url = urls.get(id);
  if (!url) {
    url = api.blob(`/api/attachments/${id}`).then((blob) => URL.createObjectURL(blob));
    urls.set(id, url);
    url.catch(() => urls.delete(id)); // let a later attempt try again
  }
  return url;
}

/** We already hold the file we just sent; no need to download it again. */
export function rememberLocalUrl(id: number, url: string): void {
  urls.set(id, Promise.resolve(url));
}

/** Why this file cannot be sent, or null if it can. */
export function fileProblem(file: File): string | null {
  if (file.size === 0) return "That file is empty";
  if (file.size > ATTACHMENT_MAX_BYTES) return "Files can be at most 5 MB";
  return null;
}

/** A picture's pixel size, so its bubble can be laid out before it loads.
 * Null for anything the browser cannot read as an image. */
export async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short name for an attachment in previews and quotes. */
export function attachmentLabel(attachment: Pick<Attachment, "is_image" | "filename">): string {
  return attachment.is_image ? "Photo" : attachment.filename;
}

/** Save the file to the person's device under its original name. */
export async function saveAttachment(attachment: Attachment): Promise<void> {
  const url = attachment.local_url ?? (await attachmentUrl(attachment.id));
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
