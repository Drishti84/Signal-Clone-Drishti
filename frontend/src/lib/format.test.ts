import { describe, expect, it } from "vitest";

import { composePhone } from "@/lib/format";

describe("composePhone", () => {
  it("adds the chosen country code to a plain number", () => {
    expect(composePhone("+91", "98765 43210")).toBe("+919876543210");
  });

  it("keeps a number typed with its own country code", () => {
    expect(composePhone("+91", "+44 7700 900123")).toBe("+447700900123");
  });

  it("does not double the country code when it was typed or pasted", () => {
    expect(composePhone("+91", "91 98765 43210")).toBe("+919876543210");
    expect(composePhone("+91", "+91 98765 43210")).toBe("+919876543210");
  });

  it("drops the leading zero people write for domestic calls", () => {
    expect(composePhone("+91", "098765 43210")).toBe("+919876543210");
  });

  it("leaves a 10-digit number that merely starts with the country code alone", () => {
    expect(composePhone("+91", "9198765432")).toBe("+919198765432");
  });
});

import { phoneProblem, previewText } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";

describe("phoneProblem", () => {
  it("accepts a number of the right length for the country", () => {
    expect(phoneProblem("+91", "98765 43210", 10)).toBeNull();
    expect(phoneProblem("+91", "098765 43210", 10)).toBeNull();
    expect(phoneProblem("+91", "+91 98765 43210", 10)).toBeNull();
  });

  it("rejects numbers that are too long or too short", () => {
    expect(phoneProblem("+91", "987654321012", 10)).toBe("Enter a valid 10-digit phone number");
    expect(phoneProblem("+91", "98765", 10)).toBe("Enter a valid 10-digit phone number");
    expect(phoneProblem("+65", "912345678", 8)).toBe("Enter a valid 8-digit phone number");
  });

  it("leaves a number typed with a different country code to the server", () => {
    expect(phoneProblem("+91", "+44 7700 900123", 10)).toBeNull();
  });
});

describe("previewText for a deleted message", () => {
  const base: Omit<Message, "sender_id"> = {
    id: 1, conversation_id: 1, type: "text", body: "", client_id: null, created_at: "",
    status: "sent", deleted: true, expires_at: null, reply_to: null, reactions: [],
    attachment: null,
  };
  const chat = { type: "direct" } as Conversation;

  it("says who deleted it without showing any text", () => {
    expect(previewText({ ...base, sender_id: 1 }, chat, 1, {})).toBe("You deleted this message");
    expect(previewText({ ...base, sender_id: 2 }, chat, 1, {})).toBe("This message was deleted");
  });
});

describe("previewText for attachments", () => {
  const chat = { type: "direct" } as Conversation;
  const base: Message = {
    id: 1, conversation_id: 1, sender_id: 2, type: "text", body: "", client_id: null,
    created_at: "", status: "sent", deleted: false, expires_at: null, reply_to: null,
    reactions: [],
    attachment: { id: 1, filename: "notes.pdf", content_type: "application/pdf", size: 10, is_image: false, width: null, height: null },
  };

  it("names the file when there is no caption", () => {
    expect(previewText(base, chat, 1, {})).toBe("📎 notes.pdf");
    expect(previewText({ ...base, attachment: { ...base.attachment!, is_image: true } }, chat, 1, {})).toBe("📷 Photo");
  });

  it("shows the caption with a marker when there is one", () => {
    expect(previewText({ ...base, body: "the plan" }, chat, 1, {})).toBe("📎 the plan");
    expect(previewText({ ...base, body: "the plan", sender_id: 1 }, chat, 1, {})).toBe("You: 📎 the plan");
  });
});
