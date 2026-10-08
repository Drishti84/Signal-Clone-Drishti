from pydantic import BaseModel, field_validator, model_validator

from app.schemas.auth import validated_phone


class ContactIn(BaseModel):
    """Add a contact either by phone number or by user id."""

    phone: str | None = None
    user_id: int | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return validated_phone(value) if value is not None else None

    @model_validator(mode="after")
    def _exactly_one(self):
        if (self.phone is None) == (self.user_id is None):
            raise ValueError("Send either phone or user_id")
        return self
