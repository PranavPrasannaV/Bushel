"""Live builds (bushel.live, bushel.serve). Offline: agency calls are replaced with fakes."""

import json
import threading
import time
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from bushel import live, serve


def test_names_are_quoted_for_a_where_clause():
    assert live._quote("o'brien fire; DROP") == "O''BRIEN FIRE DROP"
    assert live._quote("  north complex ") == "NORTH COMPLEX"


def test_live_ids_never_collide_with_demo_ids():
    assert live.fire_id("NORTH COMPLEX", 2020) == "live-north-complex-2020"
    assert serve.FILE_RE.match("/api/data/fires/live-north-complex-2020.json")
    assert not serve.FILE_RE.match("/api/data/fires/north-complex-2020.json")
    assert not serve.FILE_RE.match("/api/data/fires/live-x/../../secret.json")


def test_search_is_limited_to_the_coverage_window_and_dedupes(monkeypatch):
    seen = {}

    def fake(url, params=None):
        seen.update(params)
        a = {
            "FIRE_NAME": "CALDOR ",
            "YEAR_": 2021,
            "GIS_ACRES": 221786.4,
            "ALARM_DATE": 1628899200000,
        }
        return {"features": [{"attributes": a}, {"attributes": dict(a, GIS_ACRES=12.0)}]}

    monkeypatch.setattr(live, "get_json", fake)
    found = live.search("caldor")
    assert "YEAR_>=2018 AND YEAR_<=2023" in seen["where"]
    assert "LIKE '%CALDOR%'" in seen["where"]
    assert [f["id"] for f in found] == ["live-caldor-2021"]
    assert found[0]["gis_acres"] == 221786.4


def test_a_one_letter_search_asks_nothing(monkeypatch):
    monkeypatch.setattr(live, "get_json", lambda *a, **k: pytest.fail("queried"))
    assert live.search("x") == []


def test_years_outside_the_window_are_refused_before_any_request(monkeypatch):
    monkeypatch.setattr(live, "_features", lambda *a, **k: pytest.fail("queried"))
    with pytest.raises(live.LiveBuildError, match="outside 2018-2023"):
        live.fetch_layers("CAMP", 2024)


def test_a_build_without_lemma_explains_where_to_get_it(tmp_path):
    with pytest.raises(live.LiveBuildError, match="lemmadownload"):
        live.build("CALDOR", 2021, tmp_path)


@pytest.fixture
def server(tmp_path, monkeypatch):
    def fake_build(frap_name, year, cache, progress):
        progress("Perimeter from CAL FIRE's historic fire perimeters (FRAP)")
        if frap_name == "BROKEN":
            raise live.LiveBuildError("No FRAP perimeter for BROKEN 2021.")
        out = cache / live.LIVE_DIR / "fires"
        out.mkdir(parents=True, exist_ok=True)
        (out / "live-caldor-2021.json").write_text('{"fire": {"id": "live-caldor-2021"}}')
        return {"entry": {"id": "live-caldor-2021", "name": "Caldor", "year": year}}

    monkeypatch.setattr(live, "build", fake_build)
    httpd = ThreadingHTTPServer(
        ("127.0.0.1", 0), serve.make_handler(serve.Jobs(tmp_path), tmp_path)
    )
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def _get(url):
    with urlopen(url, timeout=5) as r:
        return json.loads(r.read())


def _post(url, body):
    req = Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urlopen(req, timeout=5) as r:
        return json.loads(r.read())


def _wait(base, job):
    for _ in range(100):
        state = _get(f"{base}/api/jobs/{job}")
        if state["state"] in ("done", "error"):
            return state
        time.sleep(0.05)
    pytest.fail("job never finished")


def test_health_reports_lemma_and_the_window(server):
    assert _get(f"{server}/api/health") == {"ok": True, "lemma": False, "years": [2018, 2023]}


def test_a_build_runs_as_a_job_and_serves_its_record(server):
    job = _post(f"{server}/api/build", {"frap_name": "CALDOR", "year": 2021})["job"]
    state = _wait(server, job)
    assert state["state"] == "done"
    assert state["result"]["entry"]["id"] == "live-caldor-2021"
    assert (
        _get(f"{server}/api/data/fires/live-caldor-2021.json")["fire"]["id"] == "live-caldor-2021"
    )


def test_a_failed_build_carries_its_reason(server):
    state = _wait(
        server, _post(f"{server}/api/build", {"frap_name": "BROKEN", "year": 2021})["job"]
    )
    assert state == {
        "state": "error",
        "step": "Perimeter from CAL FIRE's historic fire perimeters (FRAP)",
        "error": "No FRAP perimeter for BROKEN 2021.",
    }


def test_a_malformed_build_request_is_a_400(server):
    with pytest.raises(HTTPError) as e:
        _post(f"{server}/api/build", {"year": "soon"})
    assert e.value.code == 400
