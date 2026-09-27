"""Turning a campus-events .ics feed into events we can match to students.

Pure functions only (no database, no network) so they are easy to test:

    parse_feed(ics_bytes, catalog, window_start, window_end) -> list[ParsedEvent]
    filter_for_student(events, student)                      -> list[MatchedEvent]

How matching works
------------------
Sun Devil Central (CampusGroups) puts an event's "Event Type" (our `interests`)
and "Event Tags" (our `event_tags`, incl. campus + in-person/online tags) in the
event's CATEGORIES. We compare those names, ignoring case and punctuation.
If an event has no category that is an interest, we fall back to looking for an
interest name as a whole word in the title (e.g. "Resume Workshop" -> Workshop).
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, tzinfo
from typing import Iterable
from zoneinfo import ZoneInfo

import recurring_ical_events
from icalendar import Calendar

ASU_TZ = ZoneInfo("America/Phoenix")
SDC_EVENTS_PAGE = "https://sundevilcentral.eoss.asu.edu/events"

# Event tags that tell us the campus (same names as in the event_tags table).
CAMPUS_TAGS = {
    "tempe campus": "Tempe",
    "downtown phoenix campus": "Downtown Phoenix",
    "polytechnic campus": "Polytechnic",
    "west valley campus": "West Valley",
}
# Backup: campus words in the LOCATION text.
CAMPUS_WORDS = [
    (re.compile(r"\bdowntown\b|\bdtphx\b", re.I), "Downtown Phoenix"),
    (re.compile(r"\bpoly(technic)?\b", re.I), "Polytechnic"),
    (re.compile(r"\bwest valley\b|\bwest campus\b", re.I), "West Valley"),
    (re.compile(r"\blake havasu\b|\bhavasu\b", re.I), "Lake Havasu"),
    (re.compile(r"\btempe\b|\bmemorial union\b", re.I), "Tempe"),
]
ONLINE_WORDS = re.compile(r"\b(online|virtual|zoom|webinar|teams|webex|google meet)\b", re.I)
HYBRID_WORDS = re.compile(r"\bhybrid\b", re.I)


def norm(s: str) -> str:
    """'Athletic/Sports ' -> 'athletic sports', '&' -> 'and'."""
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


@dataclass
class Catalog:
    """The interest and tag lists from the database: id -> name."""

    interests: dict[int, str]
    tags: dict[int, str]

    def __post_init__(self) -> None:
        self._interest_by_norm = {norm(n): i for i, n in self.interests.items()}
        self._tag_by_norm = {norm(n): i for i, n in self.tags.items()}
        self._interest_words = [
            (re.compile(rf"\b{re.escape(n)}s?\b", re.I), i) for i, n in self.interests.items() if "/" not in n
        ]
        self.tag_id_by_name = {n: i for i, n in self.tags.items()}


@dataclass
class ParsedEvent:
    external_uid: str
    title: str
    description: str | None
    starts_at: datetime
    ends_at: datetime | None
    location: str | None
    campus: str | None
    is_online: bool          # online only
    is_hybrid: bool          # both in person and online
    event_url: str
    categories: list[str]
    interest_ids: set[int] = field(default_factory=set)
    tag_ids: set[int] = field(default_factory=set)


# --------------------------------------------------------------------------- parsing

def _text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, list):
        return " ".join(_text(x) for x in v)
    return str(v).strip()


def clean_description(raw: str) -> str | None:
    """Strip HTML and extra whitespace; keep paragraphs."""
    if not raw:
        return None
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", raw)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\r", "")
    s = re.sub(r"[ \t\xa0]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n\n", s).strip()
    return s or None


def _categories(comp) -> list[str]:
    out: list[str] = []
    raw = comp.get("CATEGORIES")
    for item in raw if isinstance(raw, list) else [raw] if raw is not None else []:
        cats = getattr(item, "cats", None)
        if cats is None:
            cats = str(item).split(",")
        out.extend(str(c).strip() for c in cats)
    # Some feeds use X- properties for event type / tags.
    for key, val in comp.items():
        k = key.upper()
        if k.startswith("X-") and any(w in k for w in ("CATEG", "TAG", "TYPE", "CAMPUS")):
            out.extend(p.strip() for p in _text(val).split(","))
    seen, uniq = set(), []
    for c in out:
        if c and norm(c) not in seen:
            seen.add(norm(c))
            uniq.append(c)
    return uniq


def _to_dt(v, tz: tzinfo) -> datetime:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=tz)
    if isinstance(v, date):  # all-day event
        return datetime.combine(v, time.min, tzinfo=tz)
    raise ValueError(f"unsupported date value {v!r}")


def match_event(ev: ParsedEvent, catalog: Catalog) -> None:
    """Fill interest_ids, tag_ids, campus, is_online, is_hybrid."""
    for c in ev.categories:
        n = norm(c)
        if n in catalog._interest_by_norm:
            ev.interest_ids.add(catalog._interest_by_norm[n])
        if n in catalog._tag_by_norm:
            ev.tag_ids.add(catalog._tag_by_norm[n])

    if not ev.interest_ids:  # fallback: interest word in the title
        for rx, iid in catalog._interest_words:
            if rx.search(ev.title):
                ev.interest_ids.add(iid)

    cat_norms = {norm(c) for c in ev.categories}
    loc = ev.location or ""

    ev.is_hybrid = "hybrid event" in cat_norms or bool(HYBRID_WORDS.search(loc))
    online_tag = "online event" in cat_norms
    in_person_tag = "in person event" in cat_norms
    ev.is_online = not ev.is_hybrid and (
        online_tag or (not in_person_tag and bool(ONLINE_WORDS.search(loc)))
    )

    ev.campus = next((CAMPUS_TAGS[n] for n in cat_norms if n in CAMPUS_TAGS), None)
    if ev.campus is None:
        ev.campus = next((name for rx, name in CAMPUS_WORDS if rx.search(loc)), None)


def parse_feed(
    ics: bytes | str,
    catalog: Catalog,
    window_start: datetime,
    window_end: datetime,
    tz: tzinfo = ASU_TZ,
) -> list[ParsedEvent]:
    """All events (recurring ones expanded) that overlap the window."""
    cal = Calendar.from_ical(ics)
    comps = recurring_ical_events.of(cal, skip_bad_series=True).between(window_start, window_end)

    events: list[ParsedEvent] = []
    uid_counts: dict[str, int] = {}
    for comp in comps:
        if _text(comp.get("STATUS")).upper() == "CANCELLED":
            continue
        title = _text(comp.get("SUMMARY"))
        dtstart = comp.get("DTSTART")
        if not title or dtstart is None:
            continue
        start = _to_dt(dtstart.dt, tz)
        dtend = comp.get("DTEND")
        end = _to_dt(dtend.dt, tz) if dtend is not None else None
        if end is None and not isinstance(dtstart.dt, datetime):
            end = start + timedelta(days=1)
        if end is not None and end <= start:
            end = None

        uid = _text(comp.get("UID")) or f"{title}|{start.isoformat()}"
        uid_counts[uid] = uid_counts.get(uid, 0) + 1

        ev = ParsedEvent(
            external_uid=uid,
            title=title,
            description=clean_description(_text(comp.get("DESCRIPTION"))),
            starts_at=start,
            ends_at=end,
            location=_text(comp.get("LOCATION")) or None,
            campus=None,
            is_online=False,
            is_hybrid=False,
            event_url=_text(comp.get("URL")) or SDC_EVENTS_PAGE,
            categories=_categories(comp),
        )
        match_event(ev, catalog)
        events.append(ev)

    # Recurring events share a UID: make each occurrence's key unique.
    for ev in events:
        if uid_counts[ev.external_uid] > 1:
            ev.external_uid = f"{ev.external_uid}|{ev.starts_at.isoformat()}"
    return events


# --------------------------------------------------------------------------- filtering

@dataclass
class StudentPrefs:
    interest_ids: set[int]
    tag_ids: set[int]
    preferred_campus: str | None
    event_format: str  # 'in_person' | 'online' | 'both'


@dataclass
class StoredEvent:
    """An event as read back from the database."""

    id: str
    title: str
    description: str | None
    starts_at: datetime
    ends_at: datetime | None
    campus: str | None
    is_online: bool
    is_hybrid: bool
    event_url: str | None
    interest_ids: set[int]
    tag_ids: set[int]


def day_bounds(day: date, tz: tzinfo = ASU_TZ) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=tz)
    return start, start + timedelta(days=1)


def filter_for_student(
    events: Iterable[StoredEvent],
    prefs: StudentPrefs,
    catalog: Catalog,
    day_start: datetime,
    day_end: datetime,
    now: datetime,
) -> list[tuple[StoredEvent, list[str]]]:
    """Today's events that match the student, with the names they matched on.

    - happening today and not over yet
    - matches at least one chosen interest or club/group tag
    - format: in person -> no online-only events; online -> online or hybrid only
    - campus: if a preferred campus is set, hide in-person events at other campuses
      (events whose campus we couldn't tell are kept)
    """
    out = []
    for ev in events:
        end = ev.ends_at or ev.starts_at + timedelta(hours=1)
        if not (ev.starts_at < day_end and end > day_start) or end <= now:
            continue

        interests = [catalog.interests[i] for i in sorted(ev.interest_ids & prefs.interest_ids) if i in catalog.interests]
        tags = [catalog.tags[t] for t in sorted(ev.tag_ids & prefs.tag_ids) if t in catalog.tags]
        if not interests and not tags:
            continue

        if prefs.event_format == "in_person" and ev.is_online:
            continue
        if prefs.event_format == "online" and not (ev.is_online or ev.is_hybrid):
            continue

        if (
            prefs.preferred_campus
            and not ev.is_online
            and not ev.is_hybrid
            and ev.campus
            and ev.campus != prefs.preferred_campus
        ):
            continue

        out.append((ev, interests + tags))

    out.sort(key=lambda pair: (pair[0].starts_at, pair[0].title.lower()))
    return out
