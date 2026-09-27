from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.config import get_settings
from app.events_feed import ASU_TZ, StoredEvent, StudentPrefs, day_bounds, filter_for_student
from app.events_sync import last_synced, load_catalog, sync_all, sync_if_stale
from app.supabase_client import get_admin_client, get_current_user_id

router = APIRouter(prefix="/events", tags=["events"])


class EventOut(BaseModel):
    id: str
    title: str
    description: str | None
    starts_at: datetime
    ends_at: datetime | None
    campus: str | None
    is_online: bool
    is_hybrid: bool
    event_url: str | None
    matched: list[str]  # the student's interests / clubs this event matched


class EventsToday(BaseModel):
    date: str
    events: list[EventOut]
    onboarded: bool


def _prefs(admin: Client, user_id: str) -> StudentPrefs | None:
    prefs = admin.table("event_preferences").select("preferred_campus, event_format").eq("user_id", user_id).execute().data
    if not prefs:
        return None
    interests = admin.table("user_interests").select("interest_id").eq("user_id", user_id).execute().data or []
    tags = admin.table("user_event_tags").select("tag_id").eq("user_id", user_id).execute().data or []
    return StudentPrefs(
        interest_ids={r["interest_id"] for r in interests},
        tag_ids={r["tag_id"] for r in tags},
        preferred_campus=prefs[0]["preferred_campus"],
        event_format=prefs[0]["event_format"],
    )


def _stored(row: dict) -> StoredEvent:
    return StoredEvent(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        starts_at=datetime.fromisoformat(row["starts_at"]),
        ends_at=datetime.fromisoformat(row["ends_at"]) if row["ends_at"] else None,
        campus=row["campus"],
        is_online=row["is_online"],
        is_hybrid=row.get("is_hybrid", False),
        event_url=row["event_url"],
        interest_ids={r["interest_id"] for r in row.get("campus_event_interests") or []},
        tag_ids={r["tag_id"] for r in row.get("campus_event_tags") or []},
    )


@router.get("/today", response_model=EventsToday)
def events_today(
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    admin: Client = Depends(get_admin_client),
) -> EventsToday:
    """Today's campus events (Arizona time) that match this student's Events preferences."""
    settings = get_settings()
    # First time ever: import now so the list isn't empty. After that, refresh
    # in the background when the data is getting old.
    if last_synced(admin) is None:
        sync_if_stale(admin, settings.events_sync_minutes)
    else:
        background.add_task(sync_if_stale, admin, settings.events_sync_minutes)

    now = datetime.now(timezone.utc)
    today = now.astimezone(ASU_TZ).date()
    day_start, day_end = day_bounds(today)

    prefs = _prefs(admin, user_id)
    if prefs is None:
        return EventsToday(date=today.isoformat(), events=[], onboarded=False)

    # Anything starting before tomorrow that might still be running today.
    rows = (
        admin.table("campus_events")
        .select("*, campus_event_interests(interest_id), campus_event_tags(tag_id)")
        .lt("starts_at", day_end.isoformat())
        .gte("starts_at", (day_start - timedelta(days=7)).isoformat())  # multi-day events
        .order("starts_at")
        .limit(5000)
        .execute()
        .data
        or []
    )
    matched = filter_for_student(
        (_stored(r) for r in rows), prefs, load_catalog(admin), day_start, day_end, now
    )
    return EventsToday(
        date=today.isoformat(),
        onboarded=True,
        events=[
            EventOut(
                id=e.id,
                title=e.title,
                description=e.description,
                starts_at=e.starts_at,
                ends_at=e.ends_at,
                campus=e.campus,
                is_online=e.is_online,
                is_hybrid=e.is_hybrid,
                event_url=e.event_url,
                matched=names,
            )
            for e, names in matched
        ],
    )


@router.post("/sync")
def sync_now(
    x_sync_secret: str = Header(default=""),
    admin: Client = Depends(get_admin_client),
) -> dict:
    """Re-import all feeds right now. Needs the EVENTS_SYNC_SECRET from backend/.env
    in an `X-Sync-Secret` header (so random people can't hammer it)."""
    secret = get_settings().events_sync_secret
    if not secret or x_sync_secret != secret:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sync secret missing or wrong")
    return {"imported": sync_all(admin)}
