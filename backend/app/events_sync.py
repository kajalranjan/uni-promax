"""Imports the campus-event .ics feeds (table event_sources) into campus_events.

Runs automatically when a student opens "Events today" and the data is more
than EVENTS_SYNC_MINUTES old, and can also be run by hand:

    python -m app.events_sync
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

import httpx
from supabase import Client

from app.events_feed import Catalog, ParsedEvent, norm, parse_feed

log = logging.getLogger(__name__)

# Import events from yesterday up to this many days ahead.
LOOKAHEAD_DAYS = 30
CHUNK = 500

_lock = threading.Lock()


def load_catalog(admin: Client) -> Catalog:
    interests = admin.table("interests").select("id, name").execute().data or []
    tags = admin.table("event_tags").select("id, name").execute().data or []
    return Catalog(
        interests={r["id"]: r["name"] for r in interests},
        tags={r["id"]: r["name"] for r in tags},
    )


def download(url: str) -> bytes:
    # webcal:// is just https:// for calendar apps
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    with httpx.Client(follow_redirects=True, timeout=60, headers={"User-Agent": "UniPromax/1.0"}) as client:
        res = client.get(url)
        res.raise_for_status()
        return res.content


def _chunks(items: list, n: int = CHUNK):
    for i in range(0, len(items), n):
        yield items[i : i + n]


def save_events(admin: Client, source_id: int, events: list[ParsedEvent], window_start: datetime) -> int:
    """Upsert events + their interest/tag links; remove events that disappeared from the feed."""
    rows = [
        {
            "source_id": source_id,
            "external_uid": e.external_uid,
            "title": e.title,
            "description": e.description,
            "campus": e.campus,
            "is_online": e.is_online,
            "is_hybrid": e.is_hybrid,
            "event_url": e.event_url,
            "categories": e.categories,
            "starts_at": e.starts_at.isoformat(),
            "ends_at": e.ends_at.isoformat() if e.ends_at else None,
        }
        for e in events
    ]
    by_uid = {e.external_uid: e for e in events}
    ids: dict[str, str] = {}
    for part in _chunks(rows):
        saved = admin.table("campus_events").upsert(part, on_conflict="external_uid").execute().data or []
        ids.update({r["external_uid"]: r["id"] for r in saved})

    event_ids = list(ids.values())
    for part in _chunks(event_ids):
        admin.table("campus_event_interests").delete().in_("event_id", part).execute()
        admin.table("campus_event_tags").delete().in_("event_id", part).execute()

    interest_links = [{"event_id": ids[u], "interest_id": i} for u, e in by_uid.items() if u in ids for i in e.interest_ids]
    tag_links = [{"event_id": ids[u], "tag_id": t} for u, e in by_uid.items() if u in ids for t in e.tag_ids]
    for part in _chunks(interest_links):
        admin.table("campus_event_interests").insert(part).execute()
    for part in _chunks(tag_links):
        admin.table("campus_event_tags").insert(part).execute()

    # Events from this feed (in the window) that are no longer in it were cancelled or deleted.
    existing = (
        admin.table("campus_events")
        .select("id, external_uid")
        .eq("source_id", source_id)
        .gte("starts_at", window_start.isoformat())
        .execute()
        .data
        or []
    )
    gone = [r["id"] for r in existing if r["external_uid"] not in ids]
    for part in _chunks(gone):
        admin.table("campus_events").delete().in_("id", part).execute()
    return len(events)


def sync_all(admin: Client, now: datetime | None = None) -> dict[str, int]:
    """Import every active feed. Returns {feed name: number of events}."""
    now = now or datetime.now(timezone.utc)
    window_start = now - timedelta(days=1)
    window_end = now + timedelta(days=LOOKAHEAD_DAYS)
    catalog = load_catalog(admin)
    sources = admin.table("event_sources").select("id, name, ics_url").eq("is_active", True).execute().data or []

    result: dict[str, int] = {}
    for src in sources:
        try:
            events = parse_feed(download(src["ics_url"]), catalog, window_start, window_end)
            result[src["name"]] = save_events(admin, src["id"], events, window_start)
            admin.table("event_sources").update({"last_synced_at": now.isoformat()}).eq("id", src["id"]).execute()
        except Exception:  # one broken feed shouldn't stop the others
            log.exception("Failed to import events from %s", src["name"])
            result[src["name"]] = -1
    return result


def last_synced(admin: Client) -> datetime | None:
    rows = (
        admin.table("event_sources")
        .select("last_synced_at")
        .eq("is_active", True)
        .order("last_synced_at", desc=False, nullsfirst=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows or rows[0]["last_synced_at"] is None:
        return None
    return datetime.fromisoformat(rows[0]["last_synced_at"])


def sync_if_stale(admin: Client, max_age_minutes: int) -> None:
    """Sync unless another request is already doing it or the data is fresh."""
    if not _lock.acquire(blocking=False):
        return
    try:
        synced = last_synced(admin)
        if synced is None or datetime.now(timezone.utc) - synced > timedelta(minutes=max_age_minutes):
            sync_all(admin)
    finally:
        _lock.release()


def dry_run(admin: Client) -> None:
    """Download + match every feed and print a report, without saving anything."""
    from collections import Counter

    now = datetime.now(timezone.utc)
    catalog = load_catalog(admin)
    sources = admin.table("event_sources").select("name, ics_url").eq("is_active", True).execute().data or []
    for src in sources:
        events = parse_feed(download(src["ics_url"]), catalog, now - timedelta(days=1), now + timedelta(days=LOOKAHEAD_DAYS))
        n = len(events) or 1
        print(f"\n=== {src['name']}: {len(events)} events in the next {LOOKAHEAD_DAYS} days")
        print(f"  matched an interest:   {sum(bool(e.interest_ids) for e in events) / n:.0%}")
        print(f"  matched a tag:         {sum(bool(e.tag_ids) for e in events) / n:.0%}")
        print(f"  campus known:          {sum(bool(e.campus) for e in events) / n:.0%}")
        print(f"  online / hybrid:       {sum(e.is_online for e in events)} / {sum(e.is_hybrid for e in events)}")
        known = {norm(x) for x in [*catalog.interests.values(), *catalog.tags.values()]}
        unknown = Counter(c for e in events for c in e.categories if norm(c) not in known)
        print("  categories we don't recognize (top 15):", unknown.most_common(15))
        for e in events[:3]:
            print(f"  - {e.starts_at:%b %d %H:%M} {e.title!r} categories={e.categories} campus={e.campus} "
                  f"interests={[catalog.interests[i] for i in e.interest_ids]}")


if __name__ == "__main__":
    import sys

    from app.supabase_client import get_admin_client

    logging.basicConfig(level=logging.INFO)
    if "--dry-run" in sys.argv:
        dry_run(get_admin_client())
    else:
        print(sync_all(get_admin_client()))
