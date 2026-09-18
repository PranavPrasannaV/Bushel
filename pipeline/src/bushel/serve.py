"""Serve Bushel with live builds: the web app, plus an API that builds any fire on request.

    python -m bushel.serve [--port 8787] [--cache ../data/cache] [--web ../web/dist]

GET  /api/health                 {"ok", "lemma", "years"}
GET  /api/search?q=caldor        FRAP fires 2018-2023 whose name contains q (live query)
POST /api/build {frap_name, year}  starts a build; returns {"job"}
GET  /api/jobs/{job}             {"state": queued|running|done|error, "step", "error", "result"}
GET  /api/data/fires/{id}.json   a live-built record (and .geojson)
GET  /*                          the built web app, if --web exists

Standard library only. One build runs at a time, so a demo cannot fan out across the agency
services.
"""

import argparse
import json
import re
import threading
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from bushel import live
from bushel.fetch import DEFAULT_CACHE

DEFAULT_WEB = Path(__file__).resolve().parents[3] / "web" / "dist"
FILE_RE = re.compile(r"^/api/data/fires/(live-[a-z0-9-]+\.(?:json|geojson))$")
JOB_RE = re.compile(r"^/api/jobs/([0-9a-f]{32})$")


class Jobs:
    """In-memory build jobs. A lock admits one build at a time; later ones queue behind it."""

    def __init__(self, cache: Path):
        self.cache = cache
        self.jobs: dict[str, dict] = {}
        self.guard = threading.Lock()
        self.one_build = threading.Lock()

    def start(self, frap_name: str, year: int) -> str:
        job = uuid.uuid4().hex
        with self.guard:
            self.jobs[job] = {
                "state": "queued",
                "step": "Waiting for the previous build",
                "error": None,
            }
        threading.Thread(target=self._run, args=(job, frap_name, year), daemon=True).start()
        return job

    def _set(self, job: str, **fields) -> None:
        with self.guard:
            self.jobs[job].update(fields)

    def _run(self, job: str, frap_name: str, year: int) -> None:
        with self.one_build:
            self._set(job, state="running", step="Starting")
            try:
                result = live.build(
                    frap_name, year, self.cache, progress=lambda s: self._set(job, step=s)
                )
                self._set(job, state="done", step="Done", result=result)
            except live.LiveBuildError as e:
                self._set(job, state="error", error=str(e))
            except Exception as e:  # an agency service failing mid-build is reported, not fatal
                self._set(job, state="error", error=f"{type(e).__name__}: {e}")

    def get(self, job: str) -> dict | None:
        with self.guard:
            found = self.jobs.get(job)
            return dict(found) if found else None


def make_handler(jobs: Jobs, web: Path):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(web), **kwargs)

        def _json(self, body, status: HTTPStatus = HTTPStatus.OK) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):  # noqa: N802 (http.server naming)
            url = urlparse(self.path)
            if not url.path.startswith("/api/"):
                if not web.exists():
                    return self._json({"error": f"no web build at {web}"}, HTTPStatus.NOT_FOUND)
                return super().do_GET()
            if url.path == "/api/health":
                years = [live.FIRST_YEAR, live.LAST_YEAR]
                return self._json(
                    {"ok": True, "lemma": live.lemma_ready(jobs.cache), "years": years}
                )
            if url.path == "/api/search":
                q = parse_qs(url.query).get("q", [""])[0]
                try:
                    return self._json({"fires": live.search(q)})
                except Exception as e:
                    return self._json({"error": str(e)}, HTTPStatus.BAD_GATEWAY)
            if m := JOB_RE.match(url.path):
                found = jobs.get(m.group(1))
                if found is None:
                    return self._json({"error": "no such job"}, HTTPStatus.NOT_FOUND)
                return self._json(found)
            if m := FILE_RE.match(url.path):
                path = jobs.cache / live.LIVE_DIR / "fires" / m.group(1)
                if not path.exists():
                    return self._json({"error": "not built"}, HTTPStatus.NOT_FOUND)
                data = path.read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return None
            return self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_POST(self):  # noqa: N802
            if urlparse(self.path).path != "/api/build":
                return self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            try:
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length) or b"{}")
                name, year = str(body["frap_name"]), int(body["year"])
            except (ValueError, KeyError, TypeError):
                return self._json({"error": "expected {frap_name, year}"}, HTTPStatus.BAD_REQUEST)
            return self._json({"job": jobs.start(name, year)}, HTTPStatus.ACCEPTED)

    return Handler


def main() -> None:
    ap = argparse.ArgumentParser(description="Serve Bushel with live builds of any fire.")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--web", type=Path, default=DEFAULT_WEB, help="built web app (npm run build)")
    args = ap.parse_args()
    jobs = Jobs(args.cache)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(jobs, args.web))
    lemma = (
        "found"
        if live.lemma_ready(args.cache)
        else "MISSING (live builds will explain how to add it)"
    )
    print(f"Bushel on http://{args.host}:{args.port}  cache={args.cache}  LEMMA {lemma}")
    server.serve_forever()


if __name__ == "__main__":
    main()
