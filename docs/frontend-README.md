# NDURANCE — Frontend

Premium React + TypeScript application for the NDURANCE gait analysis platform.
Built with Vite, TailwindCSS, and an Apple-inspired glassmorphism design system.
All backend integration points are clearly marked — connect to the FastAPI backend via the service layer.

---

## Tech Stack

| | |
|---|---|
| **Framework** | React 18 + TypeScript |
| **Build Tool** | Vite |
| **Styling** | TailwindCSS |
| **HTTP Client** | Axios (instance in `src/api/axiosInstance.ts`) |
| **State** | React Context + custom hooks (no Redux) |
| **Served by** | Nginx (production build, reverse-proxied to FastAPI) |

---

## Directory Structure

```
frontend/
├── src/
│   ├── api/
│   │   └── axiosInstance.ts    Axios base instance + JWT interceptors
│   │                           → TODO: uncomment real axios, remove mock
│   │
│   ├── services/               One file per API domain
│   │   ├── authService.ts      POST /auth/login|register|logout, GET /auth/me
│   │   ├── sessionService.ts   POST /session/start|stop|save, GET /session/*
│   │   ├── reportService.ts    POST /report/generate, GET /report/:id|pdf
│   │   ├── cameraService.ts    Navigator.mediaDevices enumeration
│   │   └── displayService.ts   Secondary display detection + window management
│   │
│   ├── context/
│   │   └── AuthContext.tsx     isAuthenticated, user, login(), signup(), logout()
│   │
│   ├── pages/                  Page components (routed from App.tsx)
│   │   ├── LoginPage.tsx       JWT login form
│   │   ├── SignupPage.tsx       Multi-step registration (name/email/body metrics)
│   │   ├── Dashboard.tsx       Live metrics widgets, quick-start
│   │   ├── CaptureLab.tsx      Session prep checklist + Start Test
│   │   ├── CameraFullscreen.tsx  Full-screen 3-camera view (secondary display)
│   │   ├── SessionStats.tsx    Post-session metrics + charts
│   │   ├── Athletes.tsx        Athlete profile list
│   │   ├── Reports.tsx         Report list + PDF export
│   │   ├── Settings.tsx        Studio configuration + threshold editor
│   │   └── Profile.tsx         User profile + body metrics + session history
│   │
│   ├── components/
│   │   ├── layout/             Sidebar, header, Layout wrapper
│   │   └── ui/                 Shared UI atoms (cards, badges, buttons…)
│   │
│   ├── types/
│   │   ├── auth.types.ts       AuthUser, LoginFormData, SignupFormData, AuthResponse
│   │   └── session.types.ts    SessionData, CameraDevice, RecordingState, ReportData
│   │
│   ├── App.tsx                 Custom page-state router + auth guard
│   ├── main.tsx                React entrypoint
│   ├── index.css               Global styles + Tailwind imports
│   └── tailwind.css            Tailwind base directives
│
├── public/                     Static assets
├── index.html
├── vite.config.ts              Vite + React + Babel (React Compiler preset)
├── tailwind.config.cjs
├── tsconfig.app.json
└── package.json
```

---

## Getting Started

### Development

```bash
npm install
npm run dev          # http://localhost:5173
```

### Production Build

```bash
npm run build        # output → dist/
```

The `dist/` folder is served by **Nginx** in the Docker stack. Nginx also reverse-proxies `/api` and `/ws` to the FastAPI backend.

---

## Routing

The app uses a **custom state-based router** in `App.tsx` (no `react-router-dom`). Navigation is handled by the `navigate(page)` function passed as a prop.

| Page State | Component | URL Pattern |
|---|---|---|
| `login` | `LoginPage` | — (default landing) |
| `signup` | `SignupPage` | — |
| `dashboard` | `Dashboard` | — |
| `capture` | `CaptureLab` | — |
| `session-stats` | `SessionStats` | — |
| `athletes` | `Athletes` | — |
| `reports` | `Reports` | — |
| `settings` | `Settings` | — |
| `profile` | `Profile` | — |
| `#fullscreen` | `CameraFullscreen` | `window.location.hash === '#fullscreen'` |

The `#fullscreen` route is opened in a **second browser window** on the secondary display via `displayService.moveCameraWindow()`.

---

## Auth Flow

```
LoginPage
  → authService.login()  →  POST /auth/login
  → store accessToken + refreshToken in localStorage
  → AuthContext.isAuthenticated = true
  → navigate('dashboard')

SignupPage
  → authService.register()  →  POST /auth/register
  → same token storage + redirect

Page refresh
  → authService.getMe()  →  GET /auth/me
  → restore user from valid session

Logout
  → authService.logout()  →  POST /auth/logout
  → clear tokens → navigate('login')
```

> **Status:** Auth currently uses a `localStorage` mock (no real API calls). Wire `axiosInstance.ts` to the FastAPI `/auth` routes to go live.

---

## Backend Integration

### Step 1 — Enable Axios

In [`src/api/axiosInstance.ts`](src/api/axiosInstance.ts), uncomment the real axios setup:

```ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// JWT interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

### Step 2 — Connect Services

Each service file has clearly marked `// TODO: Backend Integration Point` comments.
Replace the mock implementations with real `apiInstance.request(...)` calls:

| Service | Mock | Real endpoint |
|---|---|---|
| `authService.login()` | localStorage | `POST /auth/login` |
| `authService.register()` | localStorage | `POST /auth/register` |
| `authService.getMe()` | localStorage | `GET /auth/me` |
| `sessionService.startRecording()` | throws | `POST /session/start` |
| `sessionService.stopRecording()` | throws | `POST /session/{id}/stop` |
| `sessionService.getSessions()` | returns `[]` | `GET /session/athlete/{id}` |
| `reportService.generateReport()` | throws | `POST /report/generate/{id}` |
| `reportService.getReport()` | throws | `GET /report/{id}` |

### Step 3 — WebSocket

The `CameraFullscreen` and `CaptureLab` pages need a WebSocket connection to the backend:

```ts
const ws = new WebSocket(
  import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
);

ws.onmessage = (e) => {
  const payload = JSON.parse(e.data);
  // payload.overall_score, payload.gait_metrics, payload.posture_scores
};
```

### Step 4 — Environment Variables

Create a `frontend/.env.local`:
```bash
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws
```

In production (Docker + Nginx), set:
```bash
VITE_API_URL=/api       # Nginx proxies /api → FastAPI :8000
VITE_WS_URL=/ws         # Nginx proxies /ws  → FastAPI :8000
```

---

## Session Recording Hooks

`sessionService.ts` exposes the lifecycle hooks the backend will drive:

```ts
sessionService.startRecording(athleteId)    // POST /session/start
sessionService.pauseRecording(sessionId)    // POST /session/{id}/pause
sessionService.resumeRecording(sessionId)   // POST /session/{id}/resume
sessionService.stopRecording(sessionId)     // POST /session/{id}/stop
sessionService.saveSession(id, metrics)     // POST /session/{id}/save
```

On save, the backend writes:
```
data/sessions/{username}/{session_id}/
    left.webm  |  back.webm  |  right.webm
    session.json  |  report.json
```

---

## Camera System

`cameraService.ts` uses the browser **MediaDevices API** to enumerate cameras:

```ts
const cameras = await cameraService.getCameraList()
// Returns up to 3 external (non-built-in) USB cameras
// Auto-assigns LEFT / BACK / RIGHT positions

cameraService.onDeviceChange(() => rescan())
```

The backend's `GET /api/cameras` endpoint provides the server-side view of the same cameras (useful for index → `/dev/videoN` mapping).

---

## Secondary Display

`displayService.ts` detects a secondary monitor via the Window API and opens the camera fullscreen view there automatically:

```ts
const hasSecondary = await displayService.isSecondaryConnected()
if (hasSecondary) {
  displayService.moveCameraWindow(cameraUrl)  // opens at secondary display coords
} else {
  window.open(cameraUrl, 'ndurance-camera', 'popup=1')
}
```

---

## Design System

| Token | Value |
|---|---|
| Primary | `#FF6B9D` |
| Secondary | `#8B5CF6` |
| Accent | `#38BDF8` |
| Deep | `#4C1D95` |
| Background | `#08090D` |
| Text | `#F5F5F7` |
| Glass | `rgba(255,255,255,0.12)` |
| Border | `rgba(255,255,255,0.20)` |
| Blur | `20px – 30px` |
| Radius | `24px` |

Design language: **Apple WWDC Liquid Glass** — glassmorphism, soft shadows, floating panels, smooth transitions, luxury minimal.

---

## TypeScript Types

### `AuthUser`
```ts
interface AuthUser {
  id: string;         username: string;    fullName: string;
  email: string;      age: number;         gender: 'male' | 'female' | 'other';
  height: number;     weight: number;      createdAt: string;
}
```

### `SessionData`
```ts
interface SessionData {
  id: string;         athleteId: string;   startedAt: string;
  stoppedAt?: string; metrics: SessionMetrics;
  cameras: CameraDevice[];                 recordingState: RecordingState;
}
```

### `ReportData`
```ts
interface ReportData {
  session: SessionData;  avgHeartRate: number;  maxHeartRate: number;
  avgSpeed: number;      maxSpeed: number;       totalSteps: number;
  performanceScore: number;
  cameraQuality: Record<CameraPosition, number>;
}
```

---

## Code Quality Rules

- **Never hardcode backend logic** — all API calls go through service files
- **Comment every integration point** — `// TODO: Backend API — POST /auth/login`
- **One component per file** — avoid files > 300 lines
- **Use TypeScript interfaces** — no `any`
- **Prefer React Context + hooks** — no global state libraries