# NDURANCE — Backend

FastAPI application that drives real-time gait and posture analysis via MediaPipe BlazePose.
Exposes REST + WebSocket endpoints consumed by the React frontend, persists data in PostgreSQL,
and uses Redis for live session caching and JWT refresh token storage.

---

## Tech Stack

| | |
|---|---|
| **Framework** | FastAPI 0.104 + Uvicorn (ASGI) |
| **Language** | Python 3.11+ |
| **Database** | PostgreSQL 16 (asyncpg driver) |
| **Cache** | Redis 7 (hiredis) |
| **Auth** | JWT via `python-jose`, password hashing via `passlib[bcrypt]` |
| **CV / Pose** | MediaPipe BlazePose (33 landmarks), OpenCV 4.8 |
| **Container** | Docker + Docker Compose |
| **Config** | Pydantic BaseSettings (env-driven, `GAOT_` prefix) |

---

## Directory Structure

```
backend/
├── api/
│   ├── routes.py           All REST endpoints + WebSocket handlers
│   └── websocket.py        ConnectionManager (broadcast / personal)
├── analysis/
│   ├── biomechanics.py     30+ joint-angle + dimensional metrics
│   ├── gait.py             Gait cycle: step, stride, cadence, symmetry, speed
│   └── scoring.py          Green / yellow / red threshold classification engine
├── camera/
│   └── manager.py          USB camera discovery, threaded capture, multi-cam
├── config/
│   ├── settings.py         Pydantic Settings (DATABASE_URL, REDIS_URL, JWT, …)
│   └── thresholds.yaml     Biomechanical scoring thresholds (hot-reloadable)
├── db/
│   ├── schema.sql          PostgreSQL schema — auto-applied on first Docker run
│   └── redis_keys.md       Redis key/TTL reference for all namespaces
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml  Services: API + Postgres + Redis
├── pose/
│   ├── detector.py         MediaPipe wrapper → PoseResult
│   └── landmarks.py        LandmarkMapper (index → name)
├── utils/
│   └── calibration.py      Pixel → cm calibration profiles
├── visualization/
│   └── renderer.py         OpenCV skeleton / overlay renderer
├── tests/                  pytest unit tests (math, scoring, biomechanics, gait)
├── main.py                 Uvicorn entrypoint
├── run.py                  Dev runner (--install, --host, --port, --no-gpu)
├── requirements.txt
└── .env.example            Copy to .env and fill in secrets
```

---

## Getting Started

### Option A — Docker (recommended)

```bash
# 1. Configure environment
cp .env.example .env
#    → set POSTGRES_PASSWORD and JWT_SECRET

# 2. Start all services
cd docker
docker compose up

# Services:
#   ndurance-postgres  → localhost:5432  (schema auto-applied)
#   ndurance-redis     → localhost:6379
#   ndurance-api       → localhost:8000
#   API docs           → http://localhost:8000/docs
```

NVIDIA GPU variant:
```bash
docker compose --profile gpu up
```

### Option B — Local (no Docker)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set env vars (or create .env)
export GAOT_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/ndurance"
export GAOT_REDIS_URL="redis://localhost:6379/0"
export GAOT_JWT_SECRET="your-secret-here"

# 3. Run
python run.py --host 0.0.0.0 --port 8000
# or
python -m backend.main
```

Interactive docs available at `http://localhost:8000/docs`.

---

## API Endpoints

### Analysis & Camera

| Method | Path | Description |
|---|---|---|
| GET | `/` | Root — version check |
| GET | `/api/health` | Liveness: camera count, WS clients, Redis status |
| GET | `/api/cameras` | Auto-detect connected USB cameras |
| POST | `/api/start` | Start capture on all cameras (optional view assignments) |
| POST | `/api/stop` | Stop capture + reset gait analyser |
| GET | `/api/status` | Camera manager status |
| POST | `/api/camera/view` | Assign left / back / right to a camera index |
| GET | `/api/frame/{camera_id}` | Latest JPEG frame (`?annotated=true` for overlay) |
| GET | `/api/analyze-frame/{camera_id}` | One-shot REST pose/gait JSON |
| GET | `/api/dashboard` | Lightweight metrics snapshot for UI widgets |
| GET | `/api/thresholds` | Current scoring thresholds |
| PUT | `/api/thresholds` | Update thresholds (persists to YAML + Redis) |
| POST | `/api/calibrate` | Run px→cm calibration (samples N frames) |
| GET | `/api/calibration/{camera_id}` | Current calibration profile |

### WebSocket Streams

| Path | Description |
|---|---|
| `/ws` | Real-time frame stream — camera 0 |
| `/ws/{camera_id}` | Real-time frame stream — specific camera |

**Frame payload schema** (same shape for REST and WebSocket, so frontend never drifts):
```json
{
  "camera_id":    0,
  "view":         "back",
  "timestamp":    1722930000.123,
  "fps":          29.8,
  "inference_ms": 18.4,
  "confidence":   0.962,
  "landmarks":    { "0": [0.512, 0.213, -0.04], "…": [] },
  "visibility":   { "0": 0.997, "…": 0.0 },
  "angles":       { "left_knee_angle": 172.3, "…": 0.0 },
  "gait_metrics": { "cadence": 165.2, "step_count": 42, "speed": 8.1 },
  "dimensional_measurements": { "stride_distance_px": 420 },
  "posture_scores": { "knee_flexion": 88, "trunk_lean": 91 },
  "overall_score":  { "overall_score": 91.5, "grade": "A" }
}
```

### Auth Routes *(stubs — implement next)*

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create user account |
| POST | `/auth/login` | Issue JWT access + refresh tokens |
| POST | `/auth/logout` | Revoke refresh token (Redis DEL) |
| GET | `/auth/me` | Current user profile |
| POST | `/auth/refresh` | Rotate access token |

### Session + Report Routes *(stubs — implement next)*

| Method | Path | Description |
|---|---|---|
| POST | `/session/start` | Create session record in Postgres |
| POST | `/session/{id}/stop` | Finalise session, write files |
| GET | `/session/athlete/{user_id}` | Session history |
| POST | `/report/generate/{session_id}` | Build `report.json` |
| GET | `/report/{session_id}` | Fetch report |
| GET | `/report/{session_id}/pdf` | Export PDF |

---

## Database — PostgreSQL

Schema: [`db/schema.sql`](db/schema.sql) — applied automatically when the `postgres` Docker service starts with an empty data volume.

| Table | Description |
|---|---|
| `users` | Auth accounts, body metrics (height, weight, age, gender) |
| `sessions` | Recording session lifecycle + **local .webm / .json file paths** |
| `session_cameras` | Camera index → view (left/back/right) mapping per session |
| `gait_snapshots` | Per-frame JSONB payload (enables timeline playback scrubbing) |
| `gait_summary` | Aggregated session metrics (cadence, speed, symmetry, scores) |
| `reports` | Report record + local `report.json` path + cached score |
| `calibration_profiles` | Per-user, per-camera px→cm calibration |
| `threshold_overrides` | Per-user custom scoring thresholds (overrides `thresholds.yaml`) |

Connect manually:
```bash
docker exec -it ndurance-postgres psql -U ndurance -d ndurance
```

---

## Cache — Redis

Reference: [`db/redis_keys.md`](db/redis_keys.md)

| Key | TTL | Purpose |
|---|---|---|
| `ndurance:refresh:{user_id}` | 30 days | JWT refresh token (revocable on logout) |
| `ndurance:session:active:{user_id}` | 24 hours | Active session ID for a user |
| `ndurance:session:state:{session_id}` | 24 hours | Live session state (recording/paused/stopped) |
| `ndurance:metrics:live:{session_id}` | 5 seconds | Latest gait frame payload cache |
| `ndurance:calibration:{user_id}:{cam}` | 7 days | Calibration profile hot-cache |
| `ndurance:thresholds:user:{user_id}` | 1 hour | User threshold override cache |
| `ndurance:report:lock:{session_id}` | 60 seconds | Distributed generation lock (`NX`) |

Connect manually:
```bash
docker exec -it ndurance-redis redis-cli
```

---

## Local Session Storage

No cloud. All recordings and data saved on the local filesystem:

```
data/sessions/
└── {username}/
    └── {session_id}/
        ├── left.webm       Left camera recording (WebM/VP9)
        ├── back.webm       Back camera recording
        ├── right.webm      Right camera recording
        ├── session.json    Full aggregated metrics
        └── report.json     Generated report data
```

Paths stored in `sessions.video_left_path`, `video_back_path`, `video_right_path`, `session_json_path` columns.

---

## Configuration

All settings read from environment variables with `GAOT_` prefix (or `backend/.env`):

| Variable | Default | Description |
|---|---|---|
| `GAOT_DATABASE_URL` | `postgresql+asyncpg://ndurance:ndurance_secret@localhost:5432/ndurance` | PostgreSQL async DSN |
| `GAOT_REDIS_URL` | `redis://localhost:6379/0` | Redis DSN |
| `GAOT_JWT_SECRET` | **must override** | JWT HMAC secret |
| `GAOT_JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `GAOT_ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access token lifetime |
| `GAOT_REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh token lifetime |
| `GAOT_SESSION_DATA_DIR` | `data/sessions` | Local storage root |
| `GAOT_USE_GPU` | `false` | GPU acceleration |
| `GAOT_HOST` | `0.0.0.0` | Uvicorn host |
| `GAOT_PORT` | `8000` | Uvicorn port |
| `GAOT_CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed origins |
| `GAOT_MODEL_COMPLEXITY` | `1` | MediaPipe model (0=fast, 2=accurate) |

---

## Camera Setup (Linux)

```bash
# Discover devices
v4l2-ctl --list-devices

# Grant container access
sudo chmod 666 /dev/video0 /dev/video1 /dev/video2

# Or add user to video group (persistent)
sudo usermod -aG video $USER
```

**Windows:** Docker Desktop's Linux VM cannot see USB webcams directly.
Use [`usbipd-win`](https://github.com/dorssel/usbipd-win) to attach cameras to WSL2.

---

## Scoring Thresholds

Edit `config/thresholds.yaml` — changes are picked up at runtime via:
```bash
curl -X PUT http://localhost:8000/api/thresholds \
  -H "Content-Type: application/json" \
  -d '{"thresholds": {...}, "persist": true}'
```

Per-user overrides are stored in the `threshold_overrides` table and cached in Redis.

---

## Running Tests

```bash
pip install -r requirements.txt
pytest -q

# Verbose with coverage
pytest -v --tb=short
```

---

## Performance Notes

- Each camera has its own background **reader thread** — `VideoCapture.read()` never blocks the async event loop.
- Pose inference runs in a **thread-pool executor** so the FastAPI event loop stays responsive for concurrent WebSocket clients.
- The MediaPipe model is a **module-level singleton** — loaded once at process start, no per-request load cost.
- `GAOT_MODEL_COMPLEXITY=0` trades accuracy for speed on lower-end hardware.
- Redis caches the latest frame payload for 5 seconds — polling clients hit Redis, not the camera+GPU pipeline.

---

## Known Limitations

- Landmark **z-depth** from MediaPipe is less reliable than x/y — shoulder/pelvic rotation metrics are approximate.
- **Centimeter measurements** require `POST /api/calibrate` first; without it only pixel and body-relative units are returned.
- Multi-camera fusion currently picks the **highest-confidence view** per frame (not full 3D triangulation). Sufficient for the 1–3 camera use case but not a substitute for a calibrated multi-view 3D rig.
