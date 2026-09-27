"""Reading .ics calendar files: the Canvas feed and the class schedule."""

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
import recurring_ical_events
from icalendar import Calendar

MAX_ICS_BYTES = 5 * 1024 * 1024
MAX_CLASS_OCCURRENCES = 3000


class IcsError(ValueError):
    """A problem with a calendar file or URL, worded for the student."""


@dataclass
class ParsedItem:
    external_uid: str
    item_type: str  # 'class' | 'assignment' | 'event'
    title: str
    course_name: str | None
    description: str | None
    location: str | None
    starts_at: datetime  # timezone-aware; for assignments this is the due time
    ends_at: datetime | None
    all_day: bool


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

_COURSE_RE = re.compile(r"\s*\[([^\[\]]+)\]\s*$")


def _split_course(summary: str) -> tuple[str, str | None]:
    """Canvas puts the course at the end: 'Homework 3 [CSE 110 Fall 2026]'."""
    m = _COURSE_RE.search(summary)
    if not m:
        return summary.strip(), None
    return summary[: m.start()].strip() or summary.strip(), m.group(1).strip()


def _text(component, key: str, limit: int = 2000) -> str | None:
    value = component.get(key)
    if value is None:
        return None
    s = str(value).strip()
    return s[:limit] or None


def _to_datetime(value, tz: ZoneInfo, *, end_of_day: bool = False) -> tuple[datetime, bool]:
    """Returns (aware datetime, is_all_day)."""
    if isinstance(value, datetime):
        if value.tzinfo is None:  # "floating" time: treat as local
            value = value.replace(tzinfo=tz)
        return value, False
    if isinstance(value, date):
        t = time(23, 59) if end_of_day else time(0, 0)
        return datetime.combine(value, t, tzinfo=tz), True
    raise IcsError("The calendar has an event with an invalid date.")


def _load_calendar(data: bytes) -> Calendar:
    if len(data) > MAX_ICS_BYTES:
        raise IcsError("That calendar file is too large (over 5 MB).")
    if b"BEGIN:VCALENDAR" not in data[:4096].upper():
        raise IcsError("That doesn't look like a calendar (.ics) file.")
    try:
        return Calendar.from_ical(data)
    except Exception as e:
        raise IcsError("That calendar (.ics) file couldn't be read.") from e


# --------------------------------------------------------------------------
# Canvas feed
# --------------------------------------------------------------------------


def normalize_canvas_url(url: str) -> str:
    url = url.strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise IcsError("Paste the full Canvas calendar feed link (it starts with https://).")
    if "/feeds/calendars/" not in parsed.path or not parsed.path.endswith(".ics"):
        raise IcsError(
            "That isn't a Canvas calendar feed link. It should look like "
            "https://canvas.asu.edu/feeds/calendars/user_....ics"
        )
    return url


def fetch_canvas_feed(url: str) -> bytes:
    url = normalize_canvas_url(url)
    try:
        with httpx.Client(timeout=20, follow_redirects=True) as client:
            res = client.get(url)
    except httpx.HTTPError as e:
        raise IcsError("Couldn't reach Canvas. Check the link and your connection.") from e
    if res.status_code != 200:
        raise IcsError("Canvas didn't accept that link. Copy the Calendar Feed link again.")
    return res.content


def parse_canvas_feed(data: bytes, tz: ZoneInfo) -> list[ParsedItem]:
    cal = _load_calendar(data)
    items: dict[str, ParsedItem] = {}
    for ev in cal.walk("VEVENT"):
        uid = _text(ev, "UID", 500)
        dtstart = ev.get("DTSTART")
        if not uid or dtstart is None:
            continue
        is_assignment = "assignment" in uid.lower()
        title, course = _split_course(_text(ev, "SUMMARY", 500) or "Untitled")
        # Assignments due "on a day" (no time) are treated as due at 11:59 pm.
        start, all_day = _to_datetime(dtstart.dt, tz, end_of_day=is_assignment)
        end = None
        if ev.get("DTEND") is not None and not is_assignment:
            end, _ = _to_datetime(ev.get("DTEND").dt, tz)
        items[uid] = ParsedItem(
            external_uid=uid,
            item_type="assignment" if is_assignment else "event",
            title=title,
            course_name=course,
            description=_text(ev, "DESCRIPTION"),
            location=_text(ev, "LOCATION", 300),
            starts_at=start,
            ends_at=end,
            all_day=all_day,
        )
    return list(items.values())


# --------------------------------------------------------------------------
# Class schedule file
# --------------------------------------------------------------------------


def parse_class_schedule(data: bytes, tz: ZoneInfo, today: date) -> list[ParsedItem]:
    """Expands weekly classes into one row per meeting for this semester."""
    cal = _load_calendar(data)
    window_start = datetime.combine(today - timedelta(days=7), time(0), tzinfo=tz)
    window_end = datetime.combine(today + timedelta(days=150), time(0), tzinfo=tz)
    try:
        occurrences = recurring_ical_events.of(cal).between(window_start, window_end)
    except Exception as e:
        raise IcsError("The class schedule file has repeating events that couldn't be read.") from e

    items: list[ParsedItem] = []
    for ev in occurrences:
        uid = _text(ev, "UID", 500)
        dtstart = ev.get("DTSTART")
        if not uid or dtstart is None:
            continue
        start, all_day = _to_datetime(dtstart.dt, tz)
        end = None
        if ev.get("DTEND") is not None:
            end, _ = _to_datetime(ev.get("DTEND").dt, tz)
        summary = _text(ev, "SUMMARY", 500) or "Class"
        items.append(
            ParsedItem(
                external_uid=uid,
                item_type="event" if all_day else "class",
                title=summary,
                course_name=None if all_day else summary,
                description=_text(ev, "DESCRIPTION"),
                location=_text(ev, "LOCATION", 300),
                starts_at=start,
                ends_at=end,
                all_day=all_day,
            )
        )
        if len(items) >= MAX_CLASS_OCCURRENCES:
            break
    if not items:
        raise IcsError(
            "No classes were found in that file for this semester. "
            "Make sure you exported the calendar that has your classes."
        )
    return items
