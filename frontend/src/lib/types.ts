// Shapes of everything the backend sends, over REST and over the socket.

export type Avatar = { color: string; preset: string | null; image_url: string | null };

export type User = {
  id: number;
  phone: string;
  display_name: string | null;
  about: string | null;
  avatar: Avatar;
  is_online: boolean;
  last_seen_at: string | null;
};

// "sending" and "failed" exist only in the browser, before the server has the message.
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export type ReactionGroup = { emoji: string; user_ids: number[] };

export type Attachment = {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  is_image: boolean;
  width: number | null;
  height: number | null;
  /** Browser-only: a preview of a file we are sending or have just sent. */
  local_url?: string;
};

export type ReplyPreview = {
  id: number;
  sender_id: number | null;
  body: string;
  deleted: boolean;
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  type: "text" | "system";
  body: string;
  client_id: string | null;
  created_at: string;
  status: MessageStatus | null;
  /** Deleted for everyone: the bubble stays as a tombstone with no text. */
  deleted: boolean;
  /** Set on disappearing messages; the server removes them at this time. */
  expires_at: string | null;
  reply_to: ReplyPreview | null;
  reactions: ReactionGroup[];
  attachment: Attachment | null;
};

export type Member = { user: User; role: "admin" | "member"; joined_at: string };

export type Conversation = {
  id: number;
  type: "direct" | "group";
  name: string | null;
  avatar_color: string | null;
  created_by: number;
  last_message_at: string;
  /** Disappearing-message timer for new messages, or null when off. */
  disappearing_seconds: number | null;
  last_message: Message | null;
  unread_count: number;
  members: Member[];
};

export type MessagePage = { messages: Message[]; has_more: boolean };

export type VerifyResponse = { token: string; user: User; needs_profile: boolean };

export type ServerEvent =
  | { type: "message.new"; data: { message: Message } }
  | { type: "message.updated"; data: { message: Message } }
  | { type: "message.expired"; data: { conversation_id: number; message_ids: number[] } }
  | {
      type: "message.status";
      data: { conversation_id: number; message_ids: number[]; status: MessageStatus };
    }
  | {
      type: "message.reaction";
      data: { conversation_id: number; message_id: number; reactions: ReactionGroup[] };
    }
  | { type: "conversation.new"; data: { conversation: Conversation } }
  | { type: "conversation.updated"; data: { conversation: Conversation } }
  | { type: "conversation.removed"; data: { conversation_id: number } }
  | { type: "conversation.read"; data: { conversation_id: number; last_read_message_id: number } }
  | { type: "typing"; data: { conversation_id: number; user_id: number; is_typing: boolean } }
  | {
      type: "presence";
      data: { user_id: number; is_online: boolean; last_seen_at: string | null };
    }
  | { type: "user.updated"; data: { user: User } }
  | { type: "pong"; data: Record<string, never> };
