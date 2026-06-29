from __future__ import annotations

from datetime import datetime, timezone

from worker_python.time_utils import operational_timezone


def test_operational_timezone_uses_dynamic_daylight_saving_rules(monkeypatch) -> None:
    monkeypatch.setenv("OPERATIONAL_TIME_ZONE", "America/Edmonton")
    monkeypatch.delenv("TZ", raising=False)
    time_zone = operational_timezone()

    summer = datetime(2026, 6, 28, 5, 30, tzinfo=timezone.utc).astimezone(time_zone)
    winter = datetime(2026, 1, 28, 6, 30, tzinfo=timezone.utc).astimezone(time_zone)

    assert summer.date().isoformat() == "2026-06-27"
    assert summer.tzname() == "MDT"
    assert winter.date().isoformat() == "2026-01-27"
    assert winter.tzname() == "MST"


def test_operational_timezone_falls_back_to_edmonton(monkeypatch) -> None:
    monkeypatch.setenv("OPERATIONAL_TIME_ZONE", "Bad/Timezone")
    monkeypatch.delenv("TZ", raising=False)

    assert operational_timezone().key == "America/Edmonton"
