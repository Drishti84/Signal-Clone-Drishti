"use client";

import { Download, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api";
import { attachmentUrl, formatBytes, saveAttachment } from "@/lib/attachments";
import type { Attachment } from "@/lib/types";
import { useUi } from "@/store/ui";

const MAX_WIDTH = 300;
const MAX_HEIGHT = 340;

/** The object URL for a file: at once for one we just sent, otherwise after
 * it has been fetched with the login token. `failed` is true if it could
 * not be loaded (it may have been deleted or have expired). */
function useAttachmentUrl(attachment: Attachment, enabled: boolean) {
  const [loaded, setLoaded] = useState<{ id: number; url: string | null } | null>(null);
  const local = attachment.local_url ?? null;

  useEffect(() => {
    if (local || !enabled || attachment.id < 0) return;
    let cancelled = false;
    attachmentUrl(attachment.id)
      .then((url) => !cancelled && setLoaded({ id: attachment.id, url }))
      .catch(() => !cancelled && setLoaded({ id: attachment.id, url: null }));
    return () => {
      cancelled = true;
    };
  }, [attachment.id, local, enabled]);

  const mine = loaded?.id === attachment.id ? loaded : null;
  return { url: local ?? mine?.url ?? null, failed: !local && mine !== null && mine.url === null };
}

function download(attachment: Attachment) {
  saveAttachment(attachment).catch((error) => useUi.getState().toast(errorMessage(error), "error"));
}

type Props = { attachment: Attachment; isMine: boolean };

/** A picture shown in the bubble (click to enlarge), or a file card with a
 * download button. */
export function AttachmentView({ attachment, isMine }: Props) {
  const [enlarged, setEnlarged] = useState(false);
  const { url, failed } = useAttachmentUrl(attachment, attachment.is_image);

  if (!attachment.is_image) {
    return (
      <button
        type="button"
        onClick={() => download(attachment)}
        disabled={attachment.id < 0}
        title={`Download ${attachment.filename}`}
        className={`mb-1 flex w-full min-w-[200px] max-w-[300px] items-center gap-2.5 rounded-xl p-2 text-left ${isMine ? "bg-white/20 hover:bg-white/30" : "bg-quote-in hover:opacity-90"}`}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isMine ? "bg-white/25" : "bg-bg"}`}>
          <FileText size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{attachment.filename}</span>
          <span className="block text-[11px] opacity-80">{formatBytes(attachment.size)}</span>
        </span>
        <Download size={17} className="shrink-0 opacity-80" />
      </button>
    );
  }

  // Reserve the picture's space up front so the list does not jump when it loads.
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 4 / 3;
  const width = Math.round(Math.min(MAX_WIDTH, attachment.width ?? MAX_WIDTH, MAX_HEIGHT * ratio));

  return (
    <>
      <button
        type="button"
        onClick={() => url && setEnlarged(true)}
        aria-label={`Open photo ${attachment.filename}`}
        className="mb-1 block max-w-full overflow-hidden rounded-xl bg-black/10"
        style={{ width, aspectRatio: String(ratio) }}
      >
        {url ? (
          // A private blob URL: next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={attachment.filename} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[13px] opacity-80">
            {failed ? "Photo unavailable" : <Spinner />}
          </span>
        )}
      </button>

      {enlarged && url && (
        <Lightbox attachment={attachment} url={url} onClose={() => setEnlarged(false)} />
      )}
    </>
  );
}

function Lightbox({
  attachment, url, onClose,
}: { attachment: Attachment; url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.filename}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white"
      onClick={onClose}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-4" onClick={(event) => event.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-sm">{attachment.filename}</span>
        <button
          type="button"
          aria-label="Download"
          title="Download"
          onClick={() => download(attachment)}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
        >
          <Download size={19} />
        </button>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
        >
          <X size={21} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.filename}
          className="max-h-full max-w-full object-contain"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>
  );
}
