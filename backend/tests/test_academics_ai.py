import json

from app.academics import ai


def test_without_key_uses_built_in_estimates(monkeypatch):
    monkeypatch.setattr(ai, "_generate_json", lambda *a: (_ for _ in ()).throw(ai.AiUnavailable()))
    tasks = [
        ai.TaskInput(id="1", title="Final Exam", due="2026-12-10T10:00"),
        ai.TaskInput(id="2", title="Discussion post week 5", due="2026-10-01T23:59"),
        ai.TaskInput(id="3", title="Homework 4", due="2026-10-02T23:59"),
    ]
    est, prefs = ai.estimate_tasks(tasks, {})
    by_id = {e.id: e for e in est}
    assert prefs is None
    assert by_id["1"].estimated_minutes > by_id["3"].estimated_minutes > by_id["2"].estimated_minutes
    assert by_id["1"].start_days_before >= 7


def test_ai_estimates_used_and_gaps_filled(monkeypatch):
    def fake(system, prompt, schema):
        ids = [t["id"] for t in json.loads(prompt)["tasks"]]
        return ai.EstimateResult(
            estimates=[
                ai.TaskEstimate(id=ids[0], estimated_minutes=200, session_minutes=50, start_days_before=4),
                ai.TaskEstimate(id="invented", estimated_minutes=100, session_minutes=50, start_days_before=1),
            ],
            preferences=ai.StudyPreferences(day_start_hour=8, day_end_hour=21, max_minutes_per_day=180),
        )

    monkeypatch.setattr(ai, "_generate_json", fake)
    est, prefs = ai.estimate_tasks(
        [ai.TaskInput(id="a", title="Essay", due="2026-10-01T23:59"),
         ai.TaskInput(id="b", title="Quiz 3", due="2026-10-02T23:59")], {})
    assert [(e.id, e.estimated_minutes) for e in est] == [("a", 200), ("b", 90)]
    assert prefs.max_minutes_per_day == 180


def test_assistant_falls_back_politely(monkeypatch):
    monkeypatch.setattr(ai, "_generate_json", lambda *a: (_ for _ in ()).throw(ai.AiUnavailable()))
    res = ai.assistant_reply({}, [], "hi")
    assert "isn't available" in res.reply and res.new_commitments == [] and not res.replan


def test_parse_local_times():
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("America/Phoenix")
    assert ai.parse_local("2026-09-28T15:00", tz).hour == 15
    assert ai.parse_local("tomorrow 3pm", tz) is None
