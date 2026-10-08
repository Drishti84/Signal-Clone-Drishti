"use client";

import { ArrowUp, FileText, Mic, Plus, Smile, X } from "lucide-react";
import {
  useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent,
} from "react";

import { useSocketSend } from "@/components/providers/SocketProvider";
import { IconButton } from "@/components/ui/IconButton";
import { fileProblem, formatBytes, imageSize } from "@/lib/attachments";
import { COMPOSER_EMOJI, MESSAGE_MAX_LENGTH, TYPING_RESEND_MS } from "@/lib/constants";
import { displayName } from "@/lib/format";
import { useDismiss } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { useMessages, type OutgoingFile } from "@/store/messages";
import { useUi } from "@/store/ui";

const MAX_HEIGHT_PX = 132; // about six lines

/** The short type label on a file tile: "PDF", "DOCX", or "FILE". */
function fileExtension(name: string): string {
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return /^[a-z0-9]{1,4}$/i.test(extension) ? extension.toUpperCase() : "FILE";
}

type Props = { conversationId: number; meId: number; users: Record<number, User> };

/** A file picked but not sent yet, with a preview URL if it is a picture. */
type Draft = OutgoingFile & { previewUrl: string | null };

/** The message box. Enter sends, Shift+Enter adds a line. While there is
 * text it tells the other side we are typing, at most once every few seconds.
 * A file can be attached with the + button or by pasting a picture. */
export function Composer({ conversationId, meId, users }: Props) {
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const replyTo = useUi((state) => state.replyTo);
  const setReplyTo = useUi((state) => state.setReplyTo);
  const toast = useUi((state) => state.toast);
  const sendFrame = useSocketSend();

  const input = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const emojiPanel = useRef<HTMLDivElement>(null);
  const typingSentAt = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useDismiss(emojiPanel, emojiOpen, () => setEmojiOpen(false));

  const stopTyping = useCallback(() => {
    clearTimeout(stopTimer.current);
    if (typingSentAt.current === 0) return;
    typingSentAt.current = 0;
    sendFrame("typing.stop", { conversation_id: conversationId });
  }, [sendFrame, conversationId]);

  // Leaving the chat ends our typing indicator on the other side.
  useEffect(() => stopTyping, [stopTyping]);

  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  const resize = () => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const change = (value: string) => {
    setText(value);
    requestAnimationFrame(resize);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (now - typingSentAt.current > TYPING_RESEND_MS) {
      typingSentAt.current = now;
      sendFrame("typing.start", { conversation_id: conversationId });
    }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(stopTyping, TYPING_RESEND_MS);
  };

  const attach = async (file: File | null | undefined) => {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      toast(problem, "error");
      return;
    }
    const size = await imageSize(file);
    setDraft({
      file,
      width: size?.width,
      height: size?.height,
      previewUrl: size ? URL.createObjectURL(file) : null,
    });
    input.current?.focus();
  };

  const submit = () => {
    const body = text.trim();
    if (!body && !draft) return;
    if (body.length > MESSAGE_MAX_LENGTH) {
      toast(`Messages can be at most ${MESSAGE_MAX_LENGTH} characters`, "error");
      return;
    }
    useMessages.getState().send(conversationId, body, replyTo, draft ?? undefined);
    setText("");
    setDraft(null);
    setReplyTo(null);
    stopTyping();
    requestAnimationFrame(resize);
    input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: Enter is confirming an IME candidate, not sending.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && replyTo) {
      setReplyTo(null);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.files)[0];
    if (!pasted) return; // ordinary text: let the browser paste it
    event.preventDefault();
    void attach(pasted);
  };

  const canSend = text.trim().length > 0 || draft !== null;

  return (
    <div className="shrink-0 px-4 pb-4 pt-1 max-md:px-2 max-md:pb-2">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-pane py-2 pl-3 pr-2">
          <div className="min-w-0 flex-1 border-l-4 border-accent pl-2">
            <div className="text-[13px] font-semibold">
              {replyTo.sender_id === meId
                ? "You"
                : displayName(replyTo.sender_id !== null ? users[replyTo.sender_id] : null)}
            </div>
            <div className="truncate text-[13px] text-fg-2">
              {replyTo.body || (replyTo.attachment?.is_image ? "Photo" : replyTo.attachment?.filename)}
            </div>
          </div>
          <IconButton label="Cancel reply" size={28} onClick={() => setReplyTo(null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}

      {draft && (
        // A small tile at the left, as in Signal: the picture itself, or a
        // card for any other file, with the remove button on its corner.
        <div className="mb-2 flex pl-1 pt-2">
          <div className="relative">
            {draft.previewUrl ? (
              // A local preview of the picked file.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.previewUrl}
                alt={draft.file.name}
                title={draft.file.name}
                className="h-[104px] w-[104px] rounded-xl object-cover"
              />
            ) : (
              <div
                title={draft.file.name}
                className="flex h-[104px] w-[104px] flex-col items-center justify-center gap-1 rounded-xl bg-pane px-2 text-center"
              >
                <span className="relative flex h-11 w-9 items-center justify-center text-fg-2">
                  <FileText size={38} strokeWidth={1.2} />
                  <span className="absolute bottom-1.5 rounded-sm bg-accent px-1 text-[9px] font-bold leading-[13px] text-white">
                    {fileExtension(draft.file.name)}
                  </span>
                </span>
                <span className="w-full truncate text-xs font-medium">{draft.file.name}</span>
                <span className="text-[11px] leading-3 text-fg-2">{formatBytes(draft.file.size)}</span>
              </div>
            )}
            <button
              type="button"
              aria-label="Remove attachment"
              title="Remove attachment"
              onClick={() => setDraft(null)}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-fg text-bg shadow-sm ring-2 ring-bg hover:opacity-85"
            >
              <X size={14} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div ref={emojiPanel} className="relative flex min-w-0 flex-1 items-end rounded-[20px] bg-pane pl-1 pr-3">
          <IconButton label="Emoji" size={36} active={emojiOpen} className="rounded-full" onClick={() => setEmojiOpen((open) => !open)}>
            <Smile size={20} />
          </IconButton>
          {emojiOpen && (
            <div data-popover className="animate-pop-in absolute bottom-full left-0 z-20 mb-2 grid w-[296px] grid-cols-8 gap-0.5 rounded-xl bg-surface p-2 shadow-pop ring-1 ring-border">
              {COMPOSER_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Insert ${emoji}`}
                  onClick={() => {
                    change(text + emoji);
                    input.current?.focus();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-xl hover:bg-hover"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            value={text}
            onChange={(event) => change(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={stopTyping}
            rows={1}
            placeholder={draft ? "Add a caption" : "Message"}
            aria-label="Message"
            className="max-h-[132px] min-w-0 flex-1 resize-none bg-transparent py-2 pl-1 outline-none placeholder:text-fg-2"
          />
        </div>

        <input
          ref={filePicker}
          type="file"
          className="hidden"
          aria-label="Choose a file to attach"
          onChange={(event) => {
            void attach(event.target.files?.[0]);
            event.target.value = ""; // allow picking the same file again
          }}
        />

        {!canSend && (
          <IconButton label="Voice message" size={36} onClick={() => toast("Voice messages are coming soon")}>
            <Mic size={20} />
          </IconButton>
        )}
        {!draft && (
          <IconButton label="Attach a file" size={36} onClick={() => filePicker.current?.click()}>
            <Plus size={22} />
          </IconButton>
        )}
        {canSend && (
          <button
            type="button"
            aria-label="Send"
            title="Send"
            onClick={submit}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover"
          >
            <ArrowUp size={20} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}
