import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import SessionLocal, init_db
from app.errors import ServiceError
from app.realtime.events import Event
from app.realtime.manager import manager
from app.routers import auth, contacts, conversations, messages, users, ws
from app.seed import seed_if_empty
from app.services.expiry import purge_expired

log = logging.getLogger(__name__)


def _purge_once() -> list[Event]:
    with SessionLocal() as db:
        events = purge_expired(db)
        db.commit()
        return events


async def _expiry_loop(interval: float) -> None:
    """Remove expired disappearing messages for as long as the app runs."""
    while True:
        await asyncio.sleep(interval)
        try:
            # The database work is blocking, so it runs off the event loop.
            await manager.dispatch(await asyncio.to_thread(_purge_once))
        except Exception:  # one bad pass must not end the loop
            log.exception("expiry sweep failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if settings.seed_on_startup:
        # Does nothing once the database has users, so restarts are safe.
        with SessionLocal() as db:
            seed_if_empty(db)
            db.commit()
    sweeper = None
    if settings.expiry_sweep_seconds > 0:
        sweeper = asyncio.create_task(_expiry_loop(settings.expiry_sweep_seconds))
    yield
    if sweeper is not None:
        sweeper.cancel()
        with suppress(asyncio.CancelledError):
            await sweeper


app = FastAPI(title="Signal Clone API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ServiceError)
async def service_error_handler(_request: Request, exc: ServiceError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(contacts.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(ws.router)


@app.get("/health")
def health():
    return {"status": "ok"}
