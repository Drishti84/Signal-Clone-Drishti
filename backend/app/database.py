from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings

_in_memory = settings.database_url in ("sqlite://", "sqlite:///:memory:")

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    # One shared connection keeps an in-memory database alive across sessions.
    **({"poolclass": StaticPool} if _in_memory else {}),
)


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_connection, _record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    with SessionLocal() as session:
        yield session


def init_db() -> None:
    from app.models import Base

    Base.metadata.create_all(engine)
