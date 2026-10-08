from pydantic import BaseModel, field_validator

from app.errors import BadRequest
from app.schemas.user import UserOut
from app.services.phone import normalize_phone


def validated_phone(value: str) -> str:
    """Normalise inside a Pydantic validator so a bad number is a 422."""
    try:
        return normalize_phone(value)
    except BadRequest as exc:
        raise ValueError(exc.detail) from exc


class PhoneIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return validated_phone(value)


class VerifyIn(PhoneIn):
    otp: str


class RequestOtpOut(BaseModel):
    is_registered: bool


class VerifyOut(BaseModel):
    token: str
    user: UserOut
    needs_profile: bool
