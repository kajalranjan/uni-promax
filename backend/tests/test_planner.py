from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.academics.planner import Interval, Preferences, Task, plan

TZ = ZoneInfo("America/Phoenix")
NOW = datetime(2026, 9, 27, 8, 0, tzinfo=TZ)  # Sunday 8am


def at(day: int, h: int, m: int = 0) -> datetime:
    return datetime(2026, 9, day, h, m, tzinfo=TZ)


def minutes(blocks, task_id):
    return sum((b.end - b.start).total_seconds() / 60 for b in blocks if b.task_id == task_id)


def test_big_project_is_spread_out_not_crammed():
    task = Task("p", "Project", due=at(30, 23, 59), minutes=360, session_minutes=90, start_days_before=3)
    blocks, short = plan([task], [], NOW, TZ)
    assert not short
    assert minutes(blocks, "p") == 360
    days = {b.start.date() for b in blocks}
    assert len(days) >= 3  # several days, not one
    assert all(b.end <= task.due for b in blocks)
    assert all((b.end - b.start) <= timedelta(minutes=90) for b in blocks)


def test_never_overlaps_classes_or_commitments_and_stays_in_study_hours():
    classes = [Interval(at(d, 9), at(d, 10, 15)) for d in (28, 29, 30)]
    work = [Interval(at(28, 12), at(28, 17))]
    task = Task("h", "Homework", due=at(29, 23, 59), minutes=240, session_minutes=60, start_days_before=2)
    prefs = Preferences(day_start_hour=9, day_end_hour=22, max_minutes_per_day=240)
    blocks, short = plan([task], classes + work, NOW, TZ, prefs)
    assert not short
    for b in blocks:
        for c in classes + work:
            assert b.end <= c.start or b.start >= c.end, (b, c)
        assert 9 <= b.start.hour and (b.end.hour < 22 or (b.end.hour == 22 and b.end.minute == 0))


def test_earliest_due_first_and_daily_cap():
    a = Task("a", "Due soon", due=at(28, 12), minutes=120, session_minutes=60, start_days_before=1)
    b = Task("b", "Due later", due=at(30, 23), minutes=120, session_minutes=60, start_days_before=3)
    prefs = Preferences(max_minutes_per_day=90)
    blocks, _ = plan([b, a], [], NOW, TZ, prefs)
    first = min(blocks, key=lambda x: x.start)
    assert first.task_id == "a"
    per_day = {}
    for bl in blocks:
        per_day[bl.start.date()] = per_day.get(bl.start.date(), 0) + (bl.end - bl.start).total_seconds() / 60
    assert max(per_day.values()) <= 90


def test_reports_what_cannot_fit():
    task = Task("x", "Huge", due=at(27, 12), minutes=600, session_minutes=120, start_days_before=0)
    blocks, short = plan([task], [], NOW, TZ)
    assert short == ["x"]
    assert all(b.end <= task.due for b in blocks)


def test_past_due_is_skipped():
    task = Task("old", "Old", due=at(26, 12), minutes=60)
    assert plan([task], [], NOW, TZ) == ([], [])
