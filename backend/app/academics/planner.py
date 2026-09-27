"""Turns assignments into study sessions that fit around classes and commitments.

The AI decides *how much* work each assignment needs and *how early* to start;
this module decides *when*, so blocks never overlap classes, never land after a
due date, and the work is spread out instead of crammed into the last day.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

SLOT = 15  # minutes; everything snaps to quarter hours
MIN_SESSION = 30
GAP = 10  # minutes of breathing room around classes/commitments


@dataclass
class Task:
    id: str
    title: str
    due: datetime
    minutes: int
    session_minutes: int = 60
    start_days_before: int = 3


@dataclass
class Interval:
    start: datetime
    end: datetime


@dataclass
class PlannedBlock:
    task_id: str
    title: str
    start: datetime
    end: datetime


@dataclass
class Preferences:
    day_start_hour: int = 9
    day_end_hour: int = 22
    max_minutes_per_day: int = 240


def _ceil_slot(dt: datetime) -> datetime:
    extra = (dt.minute % SLOT) * 60 + dt.second + dt.microsecond / 1e6
    if extra == 0:
        return dt
    return (dt + timedelta(seconds=SLOT * 60 - extra)).replace(second=0, microsecond=0)


def _round_minutes(m: float) -> int:
    return max(SLOT, int(math.ceil(m / SLOT) * SLOT))


def _free_windows(day: date, busy: list[Interval], now: datetime, due: datetime,
                  prefs: Preferences, tz: ZoneInfo) -> list[Interval]:
    start = datetime.combine(day, time(prefs.day_start_hour), tzinfo=tz)
    end = datetime.combine(day, time(0), tzinfo=tz) + timedelta(hours=prefs.day_end_hour)
    start = max(start, _ceil_slot(now))
    end = min(end, due)
    if end - start < timedelta(minutes=MIN_SESSION):
        return []
    windows = [Interval(start, end)]
    pad = timedelta(minutes=GAP)
    for b in sorted(busy, key=lambda i: i.start):
        bs, be = b.start - pad, b.end + pad
        nxt: list[Interval] = []
        for w in windows:
            if be <= w.start or bs >= w.end:
                nxt.append(w)
                continue
            if bs > w.start:
                nxt.append(Interval(w.start, bs))
            if be < w.end:
                nxt.append(Interval(_ceil_slot(be), w.end))
        windows = [w for w in nxt if w.end - w.start >= timedelta(minutes=MIN_SESSION)]
    return windows


def plan(tasks: list[Task], busy: list[Interval], now: datetime, tz: ZoneInfo,
         prefs: Preferences | None = None) -> tuple[list[PlannedBlock], list[str]]:
    """Returns (study blocks, ids of tasks that couldn't be fully scheduled)."""
    prefs = prefs or Preferences()
    now = now.astimezone(tz)
    today = now.date()
    busy = list(busy)
    used: dict[date, int] = {}
    blocks: list[PlannedBlock] = []
    short: list[str] = []

    def place(task: Task, day: date, want: int) -> int:
        """Place up to `want` minutes of `task` on `day`; returns minutes placed."""
        placed = 0
        room = prefs.max_minutes_per_day - used.get(day, 0)
        want = min(want, room)
        for w in _free_windows(day, busy, now, task.due, prefs, tz):
            while want - placed >= SLOT:
                length = min(task.session_minutes, want - placed,
                             int((w.end - w.start).total_seconds() // 60))
                length = (length // SLOT) * SLOT
                if length < min(MIN_SESSION, want - placed):
                    break
                block = PlannedBlock(task.id, task.title, w.start, w.start + timedelta(minutes=length))
                blocks.append(block)
                busy.append(Interval(block.start, block.end))
                placed += length
                w = Interval(_ceil_slot(block.end + timedelta(minutes=GAP)), w.end)
                if w.end - w.start < timedelta(minutes=MIN_SESSION):
                    break
            if want - placed < SLOT:
                break
        used[day] = used.get(day, 0) + placed
        return placed

    # Earliest due date first, so urgent work gets the first free time.
    for task in sorted(tasks, key=lambda t: t.due):
        due = task.due.astimezone(tz)
        if due <= now:
            continue
        remaining = _round_minutes(task.minutes)
        first = max(today, due.date() - timedelta(days=max(task.start_days_before, 0)))
        days = [first + timedelta(days=i) for i in range((due.date() - first).days + 1)]

        # Spread evenly over the planned days, then catch up on any leftovers.
        for i, day in enumerate(days):
            if remaining <= 0:
                break
            per_day = _round_minutes(remaining / (len(days) - i))
            remaining -= place(task, day, per_day)
        for day in days:
            if remaining <= 0:
                break
            remaining -= place(task, day, remaining)
        # Still short: use earlier days (starting today) before the planned start.
        d = today
        while remaining > 0 and d < first:
            remaining -= place(task, d, remaining)
            d += timedelta(days=1)
        if remaining > 0:
            short.append(task.id)

    blocks.sort(key=lambda b: b.start)
    return blocks, short
