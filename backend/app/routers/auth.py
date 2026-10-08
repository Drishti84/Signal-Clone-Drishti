from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session as Db

from app.database import get_db
from app.deps import get_token
from app.realtime.manager import manager
from app.schemas.auth import PhoneIn, RequestOtpOut, VerifyIn, VerifyOut
from app.schemas.user import UserOut
from app.services import auth
from app.services.serializers import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/request-otp", response_model=RequestOtpOut)
def request_otp(body: PhoneIn, db: Db = Depends(get_db)):
    """Mocked: no code is sent. The client only learns whether the number is known."""
    return {"is_registered": auth.is_registered(db, body.phone)}


@router.post("/verify-otp", response_model=VerifyOut)
def verify_otp(body: VerifyIn, db: Db = Depends(get_db)):
    user, token, needs_profile = auth.verify_otp(db, body.phone, body.otp)
    db.commit()
    return {"token": token, "user": user_out(user, manager.online_ids()),
            "needs_profile": needs_profile}


@router.get("/demo-users", response_model=list[UserOut])
def demo_users(db: Db = Depends(get_db)):
    online = manager.online_ids()
    return [user_out(user, online) for user in auth.demo_users(db)]


@router.post("/logout", status_code=204)
def logout(token: str = Depends(get_token), db: Db = Depends(get_db)):
    auth.logout(db, token)
    db.commit()
    return Response(status_code=204)
