// Signal's avatar palette: a pale background with a strong foreground of the same hue.
export const AVATAR_COLORS: Record<string, { bg: string; fg: string }> = {
  A100: { bg: "#E3E3FE", fg: "#3838F5" },
  A110: { bg: "#DDE7FC", fg: "#1251D3" },
  A120: { bg: "#D8E8F0", fg: "#086DA0" },
  A130: { bg: "#CDE4CD", fg: "#067906" },
  A140: { bg: "#EAE0F8", fg: "#661AFF" },
  A150: { bg: "#F5E3FE", fg: "#9F00F0" },
  A160: { bg: "#F6D8EC", fg: "#B8057C" },
  A170: { bg: "#F5D7D7", fg: "#BE0404" },
  A180: { bg: "#FEF5D0", fg: "#836B01" },
  A190: { bg: "#EAE6D5", fg: "#7D6F40" },
  A200: { bg: "#D2D2DC", fg: "#4F4F6D" },
  A210: { bg: "#D7D7D9", fg: "#5C5C5C" },
};

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS);

export const AVATAR_PRESETS = [
  "cat", "dog", "bird", "fish", "rabbit", "squirrel",
  "turtle", "flower", "leaf", "star", "rocket", "music",
] as const;

export const REACTION_EMOJI = ["❤️", "👍", "👎", "😂", "😮", "😢"];

export const COMPOSER_EMOJI = [
  "😀", "😂", "🙂", "😉", "😍", "😘", "😎", "🤔", "😅", "😭", "😡", "🥳",
  "👍", "👎", "🙏", "👏", "💪", "🤝", "❤️", "🔥", "🎉", "✨", "💯", "✅",
  "☕", "🍕", "🎂", "🌧️", "☀️", "🚀", "📌", "👀",
];

export const DEMO_OTP = "123456";
export const MESSAGE_MAX_LENGTH = 4000;
export const NAME_MAX_LENGTH = 64;
export const ABOUT_MAX_LENGTH = 140;
export const AVATAR_MAX_BYTES = 256 * 1024;

export const HEARTBEAT_MS = 25_000;
export const TYPING_EXPIRY_MS = 5_000;
export const TYPING_RESEND_MS = 3_000;
export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 15_000;
export const SOCKET_UNAUTHENTICATED = 4401;

// Messages from one sender closer together than this share a bubble group.
export const GROUP_WINDOW_MS = 3 * 60_000;
