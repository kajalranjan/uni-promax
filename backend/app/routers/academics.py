from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import Client

from app.academics import ai, service
from app.academics.ics import IcsError, fetch_canvas_feed, parse_canvas_feed, parse_class_schedule
from app.config import get_settings
from app.supabase_client import get_admin_client, get_current_user_id

router = APIRouter(prefix="/academics", tags=["academics"])

MAX_UPLOAD = 5 * 1024 * 1024
SYNC_EVERY = timedelta(minutes=15)
REPLAN_EVERY = timedelta(hours=6)


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, message)


def _optional(text: str | None) -> str | None:
    return (text or "").strip()[:2000] or None


# --------------------------------------------------------------------------
# Onboarding
# --------------------------------------------------------------------------

class OnboardingRequest(BaseModel):
    canvas_ics_url: str = Field(min_length=1, max_length=2000)
    # The text of the class-schedule .ics file (the app reads the file and sends its contents).
    class_schedule_ics: str = Field(min_length=1, max_length=MAX_UPLOAD)
    class_schedule_name: str | None = Field(None, max_length=300)
    learning_style: str | None = Field(None, max_length=2000)
    time_management_style: str | None = Field(None, max_length=2000)
    semester_goals: str | None = Field(None, max_length=2000)


@router.post("/onboarding")
def onboarding(
    body: OnboardingRequest,
    user_id: str = Depends(get_current_user_id),
    db: Client = Depends(get_admin_client),
) -> dict:
    """Save the student's calendars and preferences, import everything, build the first plan.

    A plain `def` endpoint: FastAPI runs it in a worker thread, so the slow parts
    (downloading Canvas, calling the AI) don't block other requests.
    """
    return _finish_onboarding(
        db, user_id, body.class_schedule_ics.encode("utf-8"), body.class_schedule_name,
        body.canvas_ics_url, body.learning_style, body.time_management_style, body.semester_goals,
    )


def _finish_onboarding(db: Client, user_id: str, data: bytes, filename: str | None, canvas_ics_url: str,
                       learning_style: str | None, time_management_style: str | None,
                       semester_goals: str | None) -> dict:
    tz = get_settings().tz
    try:
        classes = parse_class_schedule(data, tz, service.today_local())
        canvas = parse_canvas_feed(fetch_canvas_feed(canvas_ics_url), tz)
    except IcsError as e:
        raise _bad_request(str(e))

    now = datetime.now(tz)
    db.table("academic_settings").upsert({
        "user_id": user_id,
        "canvas_ics_url": canvas_ics_url.strip(),
        "class_schedule_file": (filename or "schedule.ics")[:200],
        "learning_style": _optional(learning_style),
        "time_management_style": _optional(time_management_style),
        "semester_goals": _optional(semester_goals),
        "canvas_last_synced_at": now.isoformat(),
    }, on_conflict="user_id").execute()

    class_count = service.replace_classes(db, user_id, classes)
    canvas_result = service.sync_canvas(db, user_id, canvas)
    service.sync_todos(db, user_id)
    service.estimate_missing(db, user_id)
    plan = service.replan(db, user_id)

    db.table("profiles").update({"academics_onboarded_at": now.isoformat()}).eq("id", user_id).execute()
    return {"classes": class_count, "canvas": canvas_result, **plan}


# --------------------------------------------------------------------------
# Keeping things current
# --------------------------------------------------------------------------

class SyncRequest(BaseModel):
    force: bool = False


@router.post("/sync")
def sync(
    body: SyncRequest | None = None,
    user_id: str = Depends(get_current_user_id),
    db: Client = Depends(get_admin_client),
) -> dict:
    """Pull new/changed assignments from Canvas and refresh the plan if needed.

    The app calls this whenever the Academics page opens; it only does real
    work every 15 minutes (or when forced by pull-to-refresh).
    """
    force = bool(body and body.force)
    tz = get_settings().tz
    now = datetime.now(tz)
    settings = service._settings_row(db, user_id)
    url = settings.get("canvas_ics_url")
    if not url:
        raise _bad_request("Finish Academics setup first.")

    last = service._dt(settings.get("canvas_last_synced_at"))
    changed = {"added": 0, "updated": 0, "removed": 0}
    synced = False
    if force or last is None or now - last >= SYNC_EVERY:
        try:
            changed = service.sync_canvas(db, user_id, parse_canvas_feed(fetch_canvas_feed(url), tz))
        except IcsError as e:
            raise _bad_request(str(e))
        db.table("academic_settings").update({"canvas_last_synced_at": now.isoformat()}) \
            .eq("user_id", user_id).execute()
        service.sync_todos(db, user_id)
        synced = True

    planned = service._dt(settings.get("plan_generated_at"))
    needs_plan = any(changed.values()) or planned is None or now - planned >= REPLAN_EVERY
    result: dict = {"synced": synced, "canvas": changed, "replanned": False}
    if needs_plan:
        service.estimate_missing(db, user_id)
        result.update(service.replan(db, user_id), replanned=True)
    return result


@router.post("/replan")
def replan(user_id: str = Depends(get_current_user_id), db: Client = Depends(get_admin_client)) -> dict:
    """Rebuild study sessions (after adding a commitment or a to-do with a due date)."""
    service.sync_todos(db, user_id)
    service.estimate_missing(db, user_id)
    return service.replan(db, user_id)


# --------------------------------------------------------------------------
# AI assistant
# --------------------------------------------------------------------------

class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class AssistantResponse(BaseModel):
    reply: str
    added_commitments: int
    schedule_changed: bool


@router.post("/assistant", response_model=AssistantResponse)
def assistant(
    body: AssistantRequest,
    user_id: str = Depends(get_current_user_id),
    db: Client = Depends(get_admin_client),
) -> AssistantResponse:
    tz = get_settings().tz
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in reversed(
            db.table("ai_messages").select("role, content").eq("user_id", user_id)
            .order("created_at", desc=True).limit(12).execute().data
        )
    ]
    result = ai.assistant_reply(service.assistant_context(db, user_id), history, body.message)

    added = 0
    for c in result.new_commitments[:10]:
        start, end = ai.parse_local(c.start, tz), ai.parse_local(c.end, tz)
        if not start or not end or end <= start or end - start > timedelta(hours=16):
            continue
        db.table("schedule_blocks").insert({
            "user_id": user_id, "block_type": "commitment", "created_by": "ai",
            "title": c.title.strip()[:200] or "Commitment",
            "starts_at": start.isoformat(), "ends_at": end.isoformat(),
        }).execute()
        added += 1

    changed = False
    if added or result.replan:
        service.estimate_missing(db, user_id)
        service.replan(db, user_id)
        changed = True

    db.table("ai_messages").insert([
        {"user_id": user_id, "role": "user", "content": body.message},
        {"user_id": user_id, "role": "assistant", "content": result.reply},
    ]).execute()
    return AssistantResponse(reply=result.reply, added_commitments=added, schedule_changed=changed)
