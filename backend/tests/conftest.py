import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SEED_ON_STARTUP"] = "false"
os.environ["EXPIRY_SWEEP_SECONDS"] = "0"  # tests run the purge themselves

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal, engine
from app.main import app
from app.models import Base
from app.realtime.manager import manager


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    manager.reset()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def login(client, phone, name=None):
    """Verify the fixed OTP for `phone`; set the display name if given.
    Returns (auth headers, user dict)."""
    r = client.post("/api/auth/verify-otp", json={"phone": phone, "otp": "123456"})
    assert r.status_code == 200, r.text
    headers = {"Authorization": f"Bearer {r.json()['token']}"}
    user = r.json()["user"]
    if name:
        user = client.patch("/api/users/me", json={"display_name": name}, headers=headers).json()
    return headers, user
