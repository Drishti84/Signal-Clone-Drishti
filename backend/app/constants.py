FIXED_OTP = "123456"
SESSION_DAYS = 30
MESSAGE_MAX_LENGTH = 4000
NAME_MAX_LENGTH = 64
ABOUT_MAX_LENGTH = 140
AVATAR_MAX_BYTES = 256 * 1024
MESSAGE_PAGE_SIZE = 50
ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
FILENAME_MAX_LENGTH = 120
# An upload that is never sent with a message is thrown away after this long.
ORPHAN_ATTACHMENT_HOURS = 1

# Digits after the country code, for the countries the sign-up form offers.
# Other countries only get the general E.164 length check.
PHONE_LENGTHS = {"+91": 10, "+1": 10, "+44": 10, "+61": 9, "+65": 8, "+971": 9}

# Disappearing-message timers a chat can use (seconds), with their labels.
DISAPPEARING_CHOICES = {
    30: "30 seconds",
    300: "5 minutes",
    3600: "1 hour",
    28800: "8 hours",
    86400: "1 day",
    604800: "1 week",
    2419200: "4 weeks",
}
AVATAR_COLORS = ["A100", "A110", "A120", "A130", "A140", "A150",
                 "A160", "A170", "A180", "A190", "A200", "A210"]
AVATAR_PRESETS = ["cat", "dog", "bird", "fish", "rabbit", "squirrel",
                  "turtle", "flower", "leaf", "star", "rocket", "music"]
