"""Turn database rows into the plain dicts the API and the socket both send."""

from app.models import User


def user_out(user: User, online: set[int]) -> dict:
    image_url = (f"/api/users/{user.id}/avatar?v={user.avatar_version}"
                 if user.avatar is not None else None)
    return {
        "id": user.id,
        "phone": user.phone,
        "display_name": user.display_name,
        "about": user.about,
        "avatar": {"color": user.avatar_color, "preset": user.avatar_preset,
                   "image_url": image_url},
        "is_online": user.id in online,
        "last_seen_at": user.last_seen_at,
    }
