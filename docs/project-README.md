# NDURANCE — Gait Analysis System

> **Production-grade sports performance platform** for real-time gait and posture analysis using 1–3 synchronized USB cameras, AI pose estimation, and a premium web UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + TypeScript, Vite, TailwindCSS |
| **Backend** | FastAPI (Python 3.11+), Uvicorn (ASGI) |
| **Database** | PostgreSQL 16 |
| **Cache / Pub-Sub** | Redis 7 |
| **Reverse Proxy** | Nginx (serves frontend build + proxies API) |
| **Container** | Docker + Docker Compose |
| **CV / Pose** | MediaPipe BlazePose (33 landmarks), OpenCV |

---

## Repository Layout

```
gaot-analysis-system/
│
├── backend/                    FastAPI application
│   ├── api/
│   │   ├── routes.py           REST + WebSocket endpoints
│   │   └── websocket.py        ConnectionManager
│   ├── analysis/
│   │   ├── biomechanics.py     30+ joint-angle metrics
│   │   ├── gait.py             Step/stride/cadence/symmetry
│   │   └── scoring.py          Green/yellow/red threshold engine
│   ├── camera/
│   │   └── manager.py          Multi-camera USB capture
│   ├── config/
│   │   ├── settings.py         Pydantic BaseSettings (env-driven)
│   │   └── thresholds.yaml     Hot-reloadable scoring thresholds
│   ├── db/
│   │   ├── schema.sql          PostgreSQL schema (auto-applied on first run)
│   │   └── redis_keys.md       Redis key/TTL reference
│   ├── docker/
│   │   ├── Dockerfile
│   │   └── docker-compose.yml  All services (API + Postgres + Redis + Nginx)
│   ├── pose/                   MediaPipe wrapper + landmark mapper
│   ├── utils/                  Calibration, math helpers
│   ├── visualization/          OpenCV overlay renderer
│   ├── tests/                  pytest unit tests
│   ├── main.py                 Uvicorn entrypoint
│   ├── run.py                  Dev runner helper
│   ├── requirements.txt
│   └── .env.example            ← copy to .env before running
│
├── frontend/                   React + TS application
│   ├── src/
│   │   ├── api/
│   │   │   └── axiosInstance.ts  Axios base URL + JWT interceptors
│   │   ├── services/
│   │   │   ├── authService.ts    POST /auth/login|register|logout
│   │   │   ├── sessionService.ts POST/GET /session/*
│   │   │   ├── reportService.ts  GET/POST /report/*
│   │   │   ├── cameraService.ts  Camera enumeration (MediaDevices)
│   │   │   └── displayService.ts Secondary display detection
│   │   ├── context/
│   │   │   └── AuthContext.tsx   JWT auth state
│   │   ├── pages/               10 pages (Login, Signup, Dashboard…)
│   │   ├── components/          Layout + UI components
│   │   └── types/               auth.types.ts, session.types.ts
│   ├── vite.config.ts
│   ├── tailwind.config.cjs
│   └── package.json
│
└── README.md                   ← you are here
```

---

## Quick Start

### 1. Prerequisites

| Tool | Minimum Version |
|---|---|
| Docker + Docker Compose | 24+ |
| Node.js | 20+ |
| Python | 3.11+ |
| USB Cameras | 1–3 |

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set POSTGRES_PASSWORD, JWT_SECRET at minimum
```

### 3. Start All Services (Docker)

```bash
cd backend/docker
docker compose up
```

This spins up:
- `ndurance-postgres` on port **5432** (schema applied automatically)
- `ndurance-redis` on port **6379**
- `ndurance-api` (FastAPI) on port **8000**

CPU-only by default. For NVIDIA GPU:
```bash
docker compose --profile gpu up
```

### 4. Run the Frontend (Dev)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### 5. Camera Permissions (Linux)

```bash
# List connected cameras
v4l2-ctl --list-devices

# Fix permissions if needed
sudo chmod 666 /dev/video0 /dev/video1 /dev/video2
```

---

## Architecture Overview

```
Browser (React + TS)
    │  REST (axios)          WebSocket (ws://)
    ▼                              ▼
 Nginx (:80)
    │  /api/* proxy              /ws proxy
    ▼
 FastAPI (:8000)
    │           │
    ▼           ▼
 PostgreSQL   Redis
 (persist)    (live cache + auth tokens)
    │
    ▼
 data/sessions/{username}/{session_id}/
    ├── left.webm
    ├── back.webm
    ├── right.webm
    ├── session.json
    └── report.json
```

---

## Backend API Reference

### REST Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness — cameras + WS client count |
| GET | `/api/cameras` | Discover connected USB cameras |
| POST | `/api/start` | Start capture + pose analysis |
| POST | `/api/stop` | Stop capture, reset gait state |
| GET | `/api/status` | Camera manager status |
| POST | `/api/camera/view` | Assign left/back/right to camera index |
| GET | `/api/frame/{camera_id}` | Latest JPEG frame (annotated optional) |
| GET | `/api/analyze-frame/{camera_id}` | One-shot pose/gait JSON (no streaming) |
| GET | `/api/dashboard` | Live metrics snapshot for dashboard widget |
| GET | `/api/thresholds` | Current scoring thresholds |
| PUT | `/api/thresholds` | Update scoring thresholds (hot-reload) |
| POST | `/api/calibrate` | Run camera calibration |
| GET | `/api/calibration/{camera_id}` | Calibration profile |

### Auth Endpoints *(to be implemented — stubs ready)*

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | JWT access + refresh token |
| POST | `/auth/logout` | Revoke refresh token (Redis DEL) |
| GET | `/auth/me` | Current user profile |
| POST | `/auth/refresh` | Rotate access token |

### Session + Report Endpoints *(to be implemented — stubs ready)*

| Method | Path | Purpose |
|---|---|---|
| POST | `/session/start` | Create session record |
| POST | `/session/{id}/stop` | Finalise session, save files |
| GET | `/session/athlete/{user_id}` | Previous sessions |
| POST | `/report/generate/{session_id}` | Build report.json |
| GET | `/report/{session_id}` | Fetch report |
| GET | `/report/{session_id}/pdf` | Export PDF |

### WebSocket Streams

| Path | Description |
|---|---|
| `/ws` | Real-time frame payload — camera 0 |
| `/ws/{camera_id}` | Real-time frame payload — specific camera |

**Payload shape** (emitted on every frame with detected pose):
```json
{
  "camera_id": 0,
  "view": "back",
  "timestamp": 1722930000.123,
  "fps": 29.8,
  "inference_ms": 18.4,
  "confidence": 0.962,
  "landmarks": { "0": [0.512, 0.213, -0.04] },
  "angles": { "left_knee_angle": 172.3 },
  "gait_metrics": { "cadence": 165.2, "step_count": 42 },
  "posture_scores": { "knee_flexion": 88, "overall": { "overall_score": 91.5 } },
  "overall_score": { "overall_score": 91.5 }
}
```

---

## Database — PostgreSQL

Schema lives in [`backend/db/schema.sql`](backend/db/schema.sql) and is applied automatically when the `postgres` container first starts.

| Table | Purpose |
|---|---|
| `users` | Auth accounts + body metrics |
| `sessions` | Recording sessions with local file paths |
| `session_cameras` | Camera → view assignments per session |
| `gait_snapshots` | Per-frame JSONB payloads (timeline scrubbing) |
| `gait_summary` | Aggregated session metrics |
| `reports` | Report record + local `report.json` path |
| `calibration_profiles` | Per-user, per-camera calibration |
| `threshold_overrides` | Per-user custom scoring thresholds |

---

## Cache — Redis

See [`backend/db/redis_keys.md`](backend/db/redis_keys.md) for the full key/TTL reference.

| Namespace | Usage |
|---|---|
| `ndurance:refresh:{user_id}` | JWT refresh token (30-day TTL) |
| `ndurance:session:state:{id}` | Live session state (24-hour TTL) |
| `ndurance:metrics:live:{id}` | Latest gait frame payload (5-second TTL) |
| `ndurance:calibration:{user_id}:{cam}` | Calibration cache (7-day TTL) |
| `ndurance:thresholds:user:{user_id}` | User threshold overrides (1-hour TTL) |
| `ndurance:report:lock:{id}` | Report generation lock (60-second NX) |

---

## Local Session Storage

All session data is stored on the **local filesystem** — no cloud, no S3.

```
data/sessions/
└── {username}/
    └── {session_id}/
        ├── left.webm       Left-view camera recording
        ├── back.webm       Back-view camera recording
        ├── right.webm      Right-view camera recording
        ├── session.json    Aggregated metrics dump
        └── report.json     Generated report
```

File paths are recorded in the `sessions` table (`video_left_path`, `video_back_path`, etc.) so the API can serve or stream them on demand.

---

## Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest -q
```

---

## Environment Variables

All backend settings use the `GAOT_` prefix and can be set in `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `GAOT_DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL async URL |
| `GAOT_REDIS_URL` | `redis://localhost:6379/0` | Redis URL |
| `GAOT_JWT_SECRET` | *(must override)* | JWT signing secret |
| `GAOT_SESSION_DATA_DIR` | `data/sessions` | Local video/JSON storage root |
| `GAOT_USE_GPU` | `false` | Enable GPU acceleration |
| `GAOT_CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed CORS origins |
| `POSTGRES_PASSWORD` | `ndurance_secret` | Postgres password (Docker) |
