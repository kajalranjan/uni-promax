from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.events_feed import ASU_TZ
from app.main import app
from app.routers import events as events_router
from app.supabase_client import get_admin_client, get_current_user_id

USER = "user-1"
now_az = datetime.now(timezone.utc).astimezone(ASU_TZ)
later = (now_az + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
if later.date() != now_az.date():  # late at night: keep it "today"
    later = now_az + timedelta(minutes=5)


def ev(id_, title, interests=(), tags=(), **kw):
    return {
        "id": id_, "title": title, "description": "desc", "starts_at": later.isoformat(),
        "ends_at": (later + timedelta(minutes=50)).isoformat(), "campus": kw.get("campus"),
        "is_online": kw.get("online", False), "is_hybrid": False,
        "event_url": "https://sundevilcentral.eoss.asu.edu/rsvp?id=1",
        "campus_event_interests": [{"interest_id": i} for i in interests],
        "campus_event_tags": [{"tag_id": t} for t in tags],
    }


TABLES = {
    "interests": [{"id": 1, "name": "Workshop"}, {"id": 2, "name": "Social"}],
    "event_tags": [{"id": 10, "name": "Sustainability"}],
    "event_sources": [{"last_synced_at": datetime.now(timezone.utc).isoformat()}],
    "event_preferences": [{"user_id": USER, "preferred_campus": "Tempe", "event_format": "in_person"}],
    "user_interests": [{"user_id": USER, "interest_id": 1}],
    "user_event_tags": [{"user_id": USER, "tag_id": 10}],
    "campus_events": [
        ev("a", "Tempe Workshop", [1], campus="Tempe"),
        ev("b", "Green Club", [], [10]),
        ev("c", "Social Mixer", [2]),
        ev("d", "Online Workshop", [1], online=True),
        ev("e", "West Workshop", [1], campus="West Valley"),
    ],
}


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def eq(self, col, val):
        return FakeQuery([r for r in self.rows if col not in r or r[col] == val])

    def __getattr__(self, _name):  # select, lt, gte, order, limit ... just pass through
        return lambda *a, **k: self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class FakeAdmin:
    def table(self, name):
        return FakeQuery(TABLES[name])


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(events_router, "sync_if_stale", lambda *a, **k: None)
    app.dependency_overrides[get_admin_client] = lambda: FakeAdmin()
    app.dependency_overrides[get_current_user_id] = lambda: USER
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_events_today_filters_for_student(client):
    res = client.get("/events/today")
    assert res.status_code == 200
    body = res.json()
    assert body["onboarded"] is True
    assert body["date"] == now_az.date().isoformat()
    got = {e["title"]: e["matched"] for e in body["events"]}
    assert got == {"Tempe Workshop": ["Workshop"], "Green Club": ["Sustainability"]}


def test_sync_endpoint_needs_secret(client):
    assert client.post("/events/sync").status_code == 403
    assert client.post("/events/sync", headers={"X-Sync-Secret": "nope"}).status_code == 403


def test_events_today_requires_login():
    app.dependency_overrides[get_admin_client] = lambda: FakeAdmin()
    try:
        assert TestClient(app).get("/events/today").status_code == 401
    finally:
        app.dependency_overrides.clear()
