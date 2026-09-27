"""Database work for Academics: importing calendars, to-dos and the study plan.

Uses the server-side Supabase client, which bypasses Row Level Security,
so every query here filters by the student's user_id.
"""

from datetime import date, datetime, timedelta

from supabase import Client

from app.academics import ai
from app.academics.ics import ParsedItem
from app.academics.planner import Interval, Preferences, Task, plan
from app.config import get_settings

PLAN_HORIZON_DAYS = 21
CHUNK = 500


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _now() -> datetime:
    return datetime.now(get_settings().tz)


def _row(user_id: str, source: str, item: ParsedItem) -> dict:
    return {
        "user_id": user_id,
        "source": source,
        "item_type": item.item_type,
        "external_uid": item.external_uid,
        "course_name": item.course_name,
        "title": item.title,
        "description": item.description,
        "location": item.location,
        "starts_at": _iso(item.starts_at),
        "ends_at": _iso(item.ends_at),
        "all_day": item.all_day,
    }


def _insert_chunks(db: Client, table: str, rows: list[dict]) -> None:
    for i in range(0, len(rows), CHUNK):
        db.table(table).insert(rows[i : i + CHUNK]).execute()


# --------------------------------------------------------------------------
# Imports
# --------------------------------------------------------------------------

def replace_classes(db: Client, user_id: str, items: list[ParsedItem]) -> int:
    """The class-schedule file is uploaded once; a new upload replaces the old one."""
    db.table("calendar_items").delete().eq("user_id", user_id).eq("source", "class_schedule").execute()
    _insert_chunks(db, "calendar_items", [_row(user_id, "class_schedule", i) for i in items])
    return len(items)


def sync_canvas(db: Client, user_id: str, items: list[ParsedItem]) -> dict:
    """Make our copy of the Canvas feed match the feed (add, update, remove)."""
    existing = (
        db.table("calendar_items")
        .select("id, external_uid, title, starts_at, ends_at, description, course_name, location, all_day")
        .eq("user_id", user_id).eq("source", "canvas")
        .execute().data
    )
    by_uid = {r["external_uid"]: r for r in existing}
    new_rows, changed = [], 0
    seen: set[str] = set()
    for item in items:
        seen.add(item.external_uid)
        row = _row(user_id, "canvas", item)
        old = by_uid.get(item.external_uid)
        if old is None:
            new_rows.append(row)
            continue
        fields = ("title", "description", "course_name", "location", "all_day")
        differs = any(old.get(f) != row[f] for f in fields) or _dt(old["starts_at"]) != item.starts_at \
            or _dt(old.get("ends_at")) != item.ends_at
        if differs:
            db.table("calendar_items").update(
                {k: row[k] for k in (*fields, "item_type", "starts_at", "ends_at")}
            ).eq("id", old["id"]).eq("user_id", user_id).execute()
            changed += 1
    _insert_chunks(db, "calendar_items", new_rows)
    gone = [r["id"] for r in existing if r["external_uid"] not in seen]
    for i in range(0, len(gone), 100):
        db.table("calendar_items").delete().eq("user_id", user_id).in_("id", gone[i : i + 100]).execute()
    return {"added": len(new_rows), "updated": changed, "removed": len(gone)}


# --------------------------------------------------------------------------
# To-dos
# --------------------------------------------------------------------------

def priority_for(due: datetime | None, now: datetime) -> int:
    if due is None:
        return 3
    days = (due - now).total_seconds() / 86400
    return 1 if days <= 2 else 2 if days <= 7 else 3


def sync_todos(db: Client, user_id: str) -> int:
    """One automatic to-do per upcoming Canvas assignment; keeps title/due/priority current."""
    now = _now()
    assignments = (
        db.table("calendar_items")
        .select("id, title, course_name, starts_at")
        .eq("user_id", user_id).eq("source", "canvas").eq("item_type", "assignment")
        .gte("starts_at", _iso(now - timedelta(days=1)))
        .execute().data
    )
    todos = (
        db.table("todos").select("id, calendar_item_id, title, due_at, priority, is_done, source")
        .eq("user_id", user_id).execute().data
    )
    by_item = {t["calendar_item_id"]: t for t in todos if t["calendar_item_id"]}

    created = 0
    for a in assignments:
        due = _dt(a["starts_at"])
        title = f"{a['title']} ({a['course_name']})" if a.get("course_name") else a["title"]
        prio = priority_for(due, now)
        t = by_item.get(a["id"])
        if t is None:
            db.table("todos").insert({
                "user_id": user_id, "calendar_item_id": a["id"], "title": title,
                "due_at": a["starts_at"], "priority": prio, "source": "auto",
            }).execute()
            created += 1
        elif _dt(t["due_at"]) != due or t["title"] != title or t["priority"] != prio:
            update = {"title": title, "due_at": a["starts_at"], "priority": prio}
            if _dt(t["due_at"]) != due:
                update["estimated_minutes"] = None  # due date moved: re-estimate
            db.table("todos").update(update).eq("id", t["id"]).eq("user_id", user_id).execute()

    # Assignment removed from Canvas: drop its unfinished automatic to-do.
    db.table("todos").delete().eq("user_id", user_id).eq("source", "auto") \
        .is_("calendar_item_id", "null").eq("is_done", False).execute()
    # Keep manual to-do priorities current too.
    for t in todos:
        if t["source"] == "manual" and not t["is_done"]:
            prio = priority_for(_dt(t["due_at"]), now)
            if prio != t["priority"]:
                db.table("todos").update({"priority": prio}).eq("id", t["id"]).eq("user_id", user_id).execute()
    return created


# --------------------------------------------------------------------------
# Study plan
# --------------------------------------------------------------------------

def _settings_row(db: Client, user_id: str) -> dict:
    rows = db.table("academic_settings").select("*").eq("user_id", user_id).limit(1).execute().data
    return rows[0] if rows else {}


def _student_profile(settings: dict) -> dict:
    return {
        "learning_style": settings.get("learning_style"),
        "time_management_style": settings.get("time_management_style"),
        "semester_goals": settings.get("semester_goals"),
    }


def estimate_missing(db: Client, user_id: str) -> int:
    """Ask the AI (or built-in rules) how much work each new to-do needs."""
    now = _now()
    todos = (
        db.table("todos")
        .select("id, title, due_at, calendar_item_id, notes")
        .eq("user_id", user_id).eq("is_done", False).is_("estimated_minutes", "null")
        .gte("due_at", _iso(now)).lte("due_at", _iso(now + timedelta(days=PLAN_HORIZON_DAYS)))
        .execute().data
    )
    if not todos:
        return 0
    item_ids = [t["calendar_item_id"] for t in todos if t["calendar_item_id"]]
    details = {}
    if item_ids:
        for r in db.table("calendar_items").select("id, description, course_name") \
                .eq("user_id", user_id).in_("id", item_ids).execute().data:
            details[r["id"]] = r
    tz = get_settings().tz
    inputs = []
    for t in todos[:40]:  # keep the prompt small for the free tier
        d = details.get(t["calendar_item_id"], {})
        inputs.append(ai.TaskInput(
            id=t["id"], title=t["title"], course=d.get("course_name"),
            due=_dt(t["due_at"]).astimezone(tz).strftime("%Y-%m-%dT%H:%M"),
            details=(d.get("description") or t.get("notes") or "")[:600] or None,
        ))
    settings = _settings_row(db, user_id)
    estimates, prefs = ai.estimate_tasks(inputs, _student_profile(settings))
    for e in estimates:
        db.table("todos").update({
            "estimated_minutes": e.estimated_minutes,
            "session_minutes": e.session_minutes,
            "start_days_before": e.start_days_before,
        }).eq("id", e.id).eq("user_id", user_id).execute()
    if prefs:
        db.table("academic_settings").update({
            "study_day_start_hour": prefs.day_start_hour,
            "study_day_end_hour": prefs.day_end_hour,
            "max_study_minutes_per_day": prefs.max_minutes_per_day,
        }).eq("user_id", user_id).execute()
    return len(estimates)


def busy_intervals(db: Client, user_id: str, start: datetime, end: datetime) -> list[Interval]:
    busy: list[Interval] = []
    for r in db.table("calendar_items").select("starts_at, ends_at, all_day, item_type") \
            .eq("user_id", user_id).neq("item_type", "assignment") \
            .gte("starts_at", _iso(start - timedelta(days=1))).lt("starts_at", _iso(end)) \
            .execute().data:
        if r["all_day"] or not r["ends_at"]:
            continue
        busy.append(Interval(_dt(r["starts_at"]), _dt(r["ends_at"])))
    for r in db.table("schedule_blocks").select("starts_at, ends_at") \
            .eq("user_id", user_id).eq("block_type", "commitment") \
            .lt("starts_at", _iso(end)).gt("ends_at", _iso(start)).execute().data:
        busy.append(Interval(_dt(r["starts_at"]), _dt(r["ends_at"])))
    return busy


def replan(db: Client, user_id: str) -> dict:
    """Rebuild future AI study sessions around classes and commitments."""
    tz = get_settings().tz
    now = _now()
    horizon = now + timedelta(days=PLAN_HORIZON_DAYS)
    settings = _settings_row(db, user_id)
    prefs = Preferences(
        day_start_hour=settings.get("study_day_start_hour") or 9,
        day_end_hour=settings.get("study_day_end_hour") or 22,
        max_minutes_per_day=settings.get("max_study_minutes_per_day") or 240,
    )
    todos = (
        db.table("todos")
        .select("id, title, due_at, calendar_item_id, estimated_minutes, session_minutes, start_days_before")
        .eq("user_id", user_id).eq("is_done", False)
        .gt("due_at", _iso(now)).lte("due_at", _iso(horizon))
        .execute().data
    )
    tasks = [
        Task(id=t["id"], title=t["title"], due=_dt(t["due_at"]),
             minutes=t["estimated_minutes"] or 120,
             session_minutes=t["session_minutes"] or 60,
             start_days_before=t["start_days_before"] if t["start_days_before"] is not None else 3)
        for t in todos
    ]
    item_for = {t["id"]: t["calendar_item_id"] for t in todos}

    # Sessions already underway stay; everything later is rebuilt.
    db.table("schedule_blocks").delete().eq("user_id", user_id).eq("block_type", "study") \
        .eq("created_by", "ai").gte("starts_at", _iso(now)).execute()
    busy = busy_intervals(db, user_id, now, horizon)
    for r in db.table("schedule_blocks").select("starts_at, ends_at").eq("user_id", user_id) \
            .eq("block_type", "study").gt("ends_at", _iso(now)).execute().data:
        busy.append(Interval(_dt(r["starts_at"]), _dt(r["ends_at"])))

    blocks, short = plan(tasks, busy, now, tz, prefs)
    _insert_chunks(db, "schedule_blocks", [
        {
            "user_id": user_id, "block_type": "study", "created_by": "ai",
            "title": b.title, "starts_at": _iso(b.start), "ends_at": _iso(b.end),
            "todo_id": b.task_id, "calendar_item_id": item_for.get(b.task_id),
        }
        for b in blocks
    ])
    db.table("academic_settings").update({"plan_generated_at": _iso(now)}).eq("user_id", user_id).execute()
    return {"study_blocks": len(blocks), "not_fully_scheduled": len(short)}


# --------------------------------------------------------------------------
# Assistant context
# --------------------------------------------------------------------------

def assistant_context(db: Client, user_id: str) -> dict:
    tz = get_settings().tz
    now = _now()
    end = now + timedelta(days=7)

    def local(v: str | None) -> str | None:
        return _dt(v).astimezone(tz).strftime("%a %Y-%m-%d %H:%M") if v else None

    schedule = []
    for r in db.table("calendar_items").select("title, item_type, starts_at, ends_at, all_day") \
            .eq("user_id", user_id).neq("item_type", "assignment") \
            .gte("starts_at", _iso(now.replace(hour=0, minute=0))).lt("starts_at", _iso(end)) \
            .order("starts_at").limit(150).execute().data:
        schedule.append({"type": r["item_type"], "title": r["title"],
                         "start": local(r["starts_at"]), "end": local(r["ends_at"])})
    for r in db.table("schedule_blocks").select("title, block_type, starts_at, ends_at") \
            .eq("user_id", user_id).gte("starts_at", _iso(now.replace(hour=0, minute=0))) \
            .lt("starts_at", _iso(end)).order("starts_at").limit(150).execute().data:
        kind = "study session" if r["block_type"] == "study" else "commitment"
        schedule.append({"type": kind, "title": r["title"],
                         "start": local(r["starts_at"]), "end": local(r["ends_at"])})
    schedule.sort(key=lambda s: s["start"] or "")
    todos = [
        {"title": t["title"], "due": local(t["due_at"]), "high_priority": t["priority"] == 1,
         "estimated_minutes": t["estimated_minutes"]}
        for t in db.table("todos").select("title, due_at, priority, estimated_minutes")
        .eq("user_id", user_id).eq("is_done", False).order("due_at").limit(60).execute().data
    ]
    return {
        "now": now.strftime("%A %Y-%m-%d %H:%M"),
        "timezone": get_settings().timezone,
        "student": _student_profile(_settings_row(db, user_id)),
        "schedule_next_7_days": schedule,
        "open_todos": todos,
    }


def today_local() -> date:
    return _now().date()
