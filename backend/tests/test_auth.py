from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router
from app.supabase_client import get_admin_client

PASSWORD = "correct-horse"
USERS = {"sparky_1": "sparky@asu.edu"}  # username -> email


class FakeQuery:
    def __init__(self):
        self.pattern = None

    def select(self, *_):
        return self

    def ilike(self, _col, pattern):
        self.pattern = pattern
        return self

    def limit(self, _n):
        return self

    def execute(self):
        # emulate case-insensitive match with "\_" meaning a literal underscore
        wanted = self.pattern.replace(r"\_", "_").lower()
        rows = [{"email": e} for u, e in USERS.items() if u.lower() == wanted]
        return SimpleNamespace(data=rows)


class FakeAdmin:
    def table(self, _name):
        return FakeQuery()


class FakeAuth:
    def sign_in_with_password(self, creds):
        if creds["password"] != PASSWORD:
            raise Exception("Invalid login credentials")
        return SimpleNamespace(
            session=SimpleNamespace(access_token="access", refresh_token="refresh")
        )


@pytest.fixture
def client(monkeypatch):
    app.dependency_overrides[get_admin_client] = lambda: FakeAdmin()
    monkeypatch.setattr(auth_router, "_public_client", lambda: SimpleNamespace(auth=FakeAuth()))
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_login_success_case_insensitive(client):
    res = client.post("/auth/login", json={"username": "  SPARKY_1 ", "password": PASSWORD})
    assert res.status_code == 200
    assert res.json() == {"access_token": "access", "refresh_token": "refresh"}


@pytest.mark.parametrize(
    "username,password",
    [
        ("sparky_1", "wrong-password"),  # wrong password
        ("nobody", PASSWORD),  # unknown username
        ("sparkyx1", PASSWORD),  # "_" must not act as a wildcard
        ("a%", PASSWORD),  # invalid characters
    ],
)
def test_login_failures_share_one_message(client, username, password):
    res = client.post("/auth/login", json={"username": username, "password": password})
    assert res.status_code == 401
    assert res.json()["detail"] == "Incorrect information entered, try again"
