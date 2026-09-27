from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.academics.ics import IcsError, normalize_canvas_url, parse_canvas_feed, parse_class_schedule

TZ = ZoneInfo("America/Phoenix")

CANVAS = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Instructure//Canvas//EN
BEGIN:VEVENT
UID:event-assignment-101
DTSTART:20261001T065900Z
DTEND:20261001T065900Z
SUMMARY:Project 1: Web App [CSE 110 Fall 2026]
DESCRIPTION:Build a small web app.
END:VEVENT
BEGIN:VEVENT
UID:event-assignment-102
DTSTART;VALUE=DATE:20261003
SUMMARY:Reading Quiz 2 [ENG 101]
END:VEVENT
BEGIN:VEVENT
UID:event-calendar-event-7
DTSTART:20261002T170000Z
DTEND:20261002T180000Z
SUMMARY:Office hours [CSE 110 Fall 2026]
LOCATION:BYENG 210
END:VEVENT
END:VCALENDAR
"""

CLASSES = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar//EN
BEGIN:VEVENT
UID:cse110@google.com
DTSTART;TZID=America/Phoenix:20260824T090000
DTEND;TZID=America/Phoenix:20260824T101500
RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261204T235959Z
SUMMARY:CSE 110
LOCATION:COOR 170
END:VEVENT
END:VCALENDAR
"""


def test_canvas_assignments_and_events():
    items = {i.external_uid: i for i in parse_canvas_feed(CANVAS, TZ)}
    proj = items["event-assignment-101"]
    assert proj.item_type == "assignment"
    assert proj.title == "Project 1: Web App"
    assert proj.course_name == "CSE 110 Fall 2026"
    assert proj.starts_at.astimezone(TZ) == datetime(2026, 9, 30, 23, 59, tzinfo=TZ)
    quiz = items["event-assignment-102"]
    assert quiz.all_day and quiz.starts_at == datetime(2026, 10, 3, 23, 59, tzinfo=TZ)
    oh = items["event-calendar-event-7"]
    assert oh.item_type == "event" and oh.location == "BYENG 210" and oh.ends_at is not None


def test_class_schedule_expands_weekly_meetings():
    items = parse_class_schedule(CLASSES, TZ, today=date(2026, 9, 27))
    assert all(i.item_type == "class" for i in items)
    days = {i.starts_at.astimezone(TZ).date() for i in items}
    assert date(2026, 9, 28) in days and date(2026, 9, 30) in days  # Mon + Wed
    assert date(2026, 9, 29) not in days
    assert max(days) <= date(2026, 12, 4)
    assert items[0].ends_at - items[0].starts_at == timedelta(minutes=75)


@pytest.mark.parametrize("bad", [b"hello", b"BEGIN:VCALENDAR\nEND:VCALENDAR\n"])
def test_bad_class_files(bad):
    with pytest.raises(IcsError):
        parse_class_schedule(bad, TZ, today=date(2026, 9, 27))


def test_canvas_url_rules():
    ok = "https://canvas.asu.edu/feeds/calendars/user_abc123.ics"
    assert normalize_canvas_url("  " + ok + " ") == ok
    assert normalize_canvas_url("webcal://canvas.asu.edu/feeds/calendars/user_abc.ics").startswith("https://")
    for bad in ["http://canvas.asu.edu/feeds/calendars/user_a.ics", "https://evil.com/x.ics", "not a url"]:
        with pytest.raises(IcsError):
            normalize_canvas_url(bad)
