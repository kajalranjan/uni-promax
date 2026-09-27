"""Google Gemini calls: task estimates for the planner, and the chat assistant.

Every call has a fallback so the app keeps working without an API key, when
the free-tier limit is hit, or if the model returns something unusable.
"""

import json
import logging
import re
from datetime import datetime

from pydantic import BaseModel, Field, ValidationError

from app.config import get_settings

log = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Low-level call
# --------------------------------------------------------------------------

class AiUnavailable(Exception):
    pass


def _generate_json(system: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
    s = get_settings()
    if not s.gemini_api_key:
        raise AiUnavailable("GEMINI_API_KEY is not set")
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=s.gemini_api_key)
        res = client.models.generate_content(
            model=s.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.3,
            ),
        )
        return schema.model_validate_json(res.text or "")
    except ValidationError as e:
        log.warning("Gemini returned unexpected JSON: %s", e)
        raise AiUnavailable("bad response") from e
    except Exception as e:  # network, quota, auth...
        log.warning("Gemini call failed: %s", e)
        raise AiUnavailable(str(e)) from e


# --------------------------------------------------------------------------
# Estimates for the planner
# --------------------------------------------------------------------------

class TaskInput(BaseModel):
    id: str
    title: str
    course: str | None = None
    due: str  # local time, ISO
    details: str | None = None


class TaskEstimate(BaseModel):
    id: str
    estimated_minutes: int = Field(ge=15, le=3000)
    session_minutes: int = Field(ge=30, le=180)
    start_days_before: int = Field(ge=0, le=21)


class StudyPreferences(BaseModel):
    day_start_hour: int = Field(ge=5, le=14)
    day_end_hour: int = Field(ge=15, le=24)
    max_minutes_per_day: int = Field(ge=60, le=600)


class EstimateResult(BaseModel):
    estimates: list[TaskEstimate]
    preferences: StudyPreferences


ESTIMATE_SYSTEM = """You are a study planner for a university student.
For each task, estimate realistically:
- estimated_minutes: total focused work time needed (reading, drafting, studying; not class time)
- session_minutes: a good length for one sitting (30-180)
- start_days_before: how many days before the due date to start so work is spread out, not crammed
Big projects, papers and exams need more total time and an earlier start; small
quizzes and discussion posts need little. Use the student's own description of
their learning style, time management and goals to adjust (e.g. procrastinators
should start earlier; people who focus in short bursts get shorter sessions).
Also give study preferences: the earliest and latest hours of the day they
should study (24h clock) and a sensible daily maximum of study minutes.
Return every task id exactly once."""


def _heuristic(task: TaskInput) -> TaskEstimate:
    t = f"{task.title} {task.details or ''}".lower()
    if re.search(r"\b(final|midterm|exam|test)\b", t):
        return TaskEstimate(id=task.id, estimated_minutes=480, session_minutes=90, start_days_before=7)
    if re.search(r"\b(project|paper|essay|report|presentation|capstone)\b", t):
        return TaskEstimate(id=task.id, estimated_minutes=420, session_minutes=90, start_days_before=7)
    if re.search(r"\b(quiz)\b", t):
        return TaskEstimate(id=task.id, estimated_minutes=90, session_minutes=45, start_days_before=2)
    if re.search(r"\b(discussion|reflection|reading|response|post)\b", t):
        return TaskEstimate(id=task.id, estimated_minutes=45, session_minutes=45, start_days_before=1)
    if re.search(r"\b(lab)\b", t):
        return TaskEstimate(id=task.id, estimated_minutes=180, session_minutes=90, start_days_before=4)
    return TaskEstimate(id=task.id, estimated_minutes=120, session_minutes=60, start_days_before=3)


def estimate_tasks(tasks: list[TaskInput], student_profile: dict) -> tuple[list[TaskEstimate], StudyPreferences | None]:
    """Returns one estimate per task (AI when possible, built-in rules otherwise)."""
    if not tasks:
        return [], None
    by_id: dict[str, TaskEstimate] = {}
    prefs: StudyPreferences | None = None
    try:
        prompt = json.dumps({"student": student_profile, "tasks": [t.model_dump() for t in tasks]})
        result = _generate_json(ESTIMATE_SYSTEM, prompt, EstimateResult)
        wanted = {t.id for t in tasks}
        by_id = {e.id: e for e in result.estimates if e.id in wanted}
        prefs = result.preferences
        if prefs.day_end_hour - prefs.day_start_hour < 4:
            prefs = None
    except AiUnavailable:
        pass
    return [by_id.get(t.id) or _heuristic(t) for t in tasks], prefs


# --------------------------------------------------------------------------
# Assistant chat
# --------------------------------------------------------------------------

class NewCommitment(BaseModel):
    title: str
    start: str = Field(description="Local start time, format YYYY-MM-DDTHH:MM")
    end: str = Field(description="Local end time, format YYYY-MM-DDTHH:MM")


class AssistantResult(BaseModel):
    reply: str
    new_commitments: list[NewCommitment] = []
    replan: bool = False


ASSISTANT_SYSTEM = """You are the AI assistant inside Uni Promax, a student planner app.
You see the student's classes, commitments, planned study sessions and to-dos
for the coming days (all times are local, 24h clock). You can:
1. Answer questions about their schedule, clearly and briefly.
2. When they mention something they have to do at a certain time (work shift,
   appointment, practice, "I'm busy 3-5 tomorrow"), add it to new_commitments
   with exact local start and end times. Resolve words like "today",
   "tomorrow" and weekday names using the current time you are given.
   If a time is too vague to place, ask a short follow-up question instead.
3. Set replan to true when commitments were added or when they ask you to
   rearrange, lighten or rebuild their study plan. The app then reschedules
   study sessions automatically around everything else.
Be encouraging and concrete. Keep replies under 120 words. Plain text, no markdown."""


def assistant_reply(context: dict, history: list[dict], message: str) -> AssistantResult:
    try:
        prompt = json.dumps({"context": context, "conversation": history, "new_message": message})
        return _generate_json(ASSISTANT_SYSTEM, prompt, AssistantResult)
    except AiUnavailable:
        return AssistantResult(
            reply="The AI assistant isn't available right now. Your schedule and to-dos still "
                  "work, and you can add commitments from Today's schedule.",
        )


def parse_local(value: str, tz) -> datetime | None:
    """Parse the assistant's local 'YYYY-MM-DDTHH:MM' times."""
    try:
        dt = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    return dt.replace(tzinfo=tz) if dt.tzinfo is None else dt.astimezone(tz)
