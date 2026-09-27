from datetime import date, datetime, timedelta, timezone

import pytest

from app.events_feed import (
    ASU_TZ,
    Catalog,
    StoredEvent,
    StudentPrefs,
    day_bounds,
    filter_for_student,
    parse_feed,
)

CATALOG = Catalog(
    interests={1: "Workshop", 2: "Social", 3: "Athletic/Sports", 4: "Career Workshop", 5: "Lecture"},
    tags={10: "Tempe Campus", 11: "Downtown Phoenix Campus", 12: "Online Event", 13: "Hybrid Event",
          14: "In-Person Event", 15: "Sustainability", 16: "Barrett Student Organization"},
)

# Shaped like a Sun Devil Central (CampusGroups) feed.
FEED = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CampusGroups//EN
BEGIN:VEVENT
UID:CG_EVENT_1001
DTSTART:20261001T170000Z
DTEND:20261001T190000Z
SUMMARY:Resume Workshop
DESCRIPTION:<p>Bring your resume!</p><p>Snacks &amp; coffee</p>
LOCATION:Sign in to view the location
CATEGORIES:Career Workshop,Tempe Campus,In-Person Event
URL:https://sundevilcentral.eoss.asu.edu/rsvp?id=1001
END:VEVENT
BEGIN:VEVENT
UID:CG_EVENT_1002
DTSTART:20261001T230000Z
DTEND:20261002T010000Z
SUMMARY:Green Devils Social Night
CATEGORIES:Social
CATEGORIES:Sustainability,Hybrid Event
LOCATION:Downtown Phoenix - Cronkite 101 / Zoom
END:VEVENT
BEGIN:VEVENT
UID:CG_EVENT_1003
DTSTART:20261001T200000Z
DTEND:20261001T210000Z
SUMMARY:Guest Lecture on Water Policy
LOCATION:Zoom
END:VEVENT
BEGIN:VEVENT
UID:CG_EVENT_1004
DTSTART:20261001T200000Z
SUMMARY:Cancelled thing
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:CG_EVENT_1005
DTSTART;VALUE=DATE:20261001
SUMMARY:Sun Devil Welcome Week
CATEGORIES:social
END:VEVENT
BEGIN:VEVENT
UID:CG_EVENT_1006
DTSTART:20260929T160000Z
DTEND:20260929T170000Z
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Morning Run Club
CATEGORIES:Athletic/Sports
END:VEVENT
END:VCALENDAR
"""

W_START = datetime(2026, 9, 28, tzinfo=timezone.utc)
W_END = datetime(2026, 10, 30, tzinfo=timezone.utc)


@pytest.fixture
def events():
    return {e.title: e for e in parse_feed(FEED, CATALOG, W_START, W_END)}


def test_categories_become_interests_and_tags(events):
    e = events["Resume Workshop"]
    assert e.interest_ids == {4}
    assert e.tag_ids == {10, 14}
    assert e.campus == "Tempe" and not e.is_online and not e.is_hybrid
    assert e.description == "Bring your resume!\nSnacks & coffee"
    assert e.event_url.endswith("id=1001")


def test_multiple_categories_lines_and_hybrid(events):
    e = events["Green Devils Social Night"]
    assert e.interest_ids == {2}
    assert e.tag_ids == {15, 13}
    assert e.is_hybrid and not e.is_online
    assert e.campus == "Downtown Phoenix"  # from the location text


def test_title_fallback_and_online_from_location(events):
    e = events["Guest Lecture on Water Policy"]
    assert e.interest_ids == {5}
    assert e.is_online and e.campus is None
    assert e.event_url.startswith("https://sundevilcentral")


def test_cancelled_skipped_all_day_and_case_insensitive(events):
    assert "Cancelled thing" not in events
    e = events["Sun Devil Welcome Week"]
    assert e.interest_ids == {2}
    assert e.ends_at - e.starts_at == timedelta(days=1)
    assert e.starts_at.tzinfo is not None


def test_recurring_events_expanded_with_unique_keys():
    runs = [e for e in parse_feed(FEED, CATALOG, W_START, W_END) if e.title == "Morning Run Club"]
    assert len(runs) == 3
    assert len({e.external_uid for e in runs}) == 3


# ------------------------------------------------------------------ filtering

DAY = date(2026, 10, 1)
DAY_START, DAY_END = day_bounds(DAY)
MORNING = datetime(2026, 10, 1, 8, 0, tzinfo=ASU_TZ)


def stored(title, hour, *, interests=(), tags=(), campus=None, online=False, hybrid=False, hours=1, day=DAY):
    start = datetime(day.year, day.month, day.day, hour, tzinfo=ASU_TZ)
    return StoredEvent(
        id=title, title=title, description=None, starts_at=start, ends_at=start + timedelta(hours=hours),
        campus=campus, is_online=online, is_hybrid=hybrid, event_url=None,
        interest_ids=set(interests), tag_ids=set(tags),
    )


EVENTS = [
    stored("Tempe workshop", 10, interests=[1], campus="Tempe"),
    stored("Downtown workshop", 11, interests=[1], campus="Downtown Phoenix"),
    stored("Online workshop", 12, interests=[1], online=True),
    stored("Hybrid social", 13, interests=[2], hybrid=True, campus="Downtown Phoenix"),
    stored("Unknown-campus lecture", 14, interests=[5]),
    stored("Barrett mixer", 15, tags=[16], campus="Tempe"),
    stored("Sports (not picked)", 16, interests=[3]),
    stored("Already over", 6, interests=[1]),
    stored("Tomorrow workshop", 10, interests=[1], day=date(2026, 10, 2)),
]


def titles(prefs):
    return [e.title for e, _ in filter_for_student(EVENTS, prefs, CATALOG, DAY_START, DAY_END, MORNING)]


def test_both_formats_no_campus():
    prefs = StudentPrefs({1, 2, 5}, {16}, None, "both")
    assert titles(prefs) == [
        "Tempe workshop", "Downtown workshop", "Online workshop",
        "Hybrid social", "Unknown-campus lecture", "Barrett mixer",
    ]


def test_in_person_at_tempe():
    prefs = StudentPrefs({1, 2, 5}, set(), "Tempe", "in_person")
    # no online-only, no other-campus in-person; hybrid + unknown campus are kept
    assert titles(prefs) == ["Tempe workshop", "Hybrid social", "Unknown-campus lecture"]


def test_online_only():
    prefs = StudentPrefs({1, 2, 5}, set(), "Tempe", "online")
    assert titles(prefs) == ["Online workshop", "Hybrid social"]


def test_matched_names_include_interests_and_tags():
    ev = stored("Both", 12, interests=[1, 2], tags=[15])
    prefs = StudentPrefs({1, 2}, {15}, None, "both")
    [(_, names)] = filter_for_student([ev], prefs, CATALOG, DAY_START, DAY_END, MORNING)
    assert names == ["Workshop", "Social", "Sustainability"]
