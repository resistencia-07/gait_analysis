/* ============================================================
   NDURANCE — Pose Engine
   MediaPipe BlazePose (33 landmarks) via @mediapipe/tasks-vision
   + biomechanics (joint angles) + gait analyser + scoring engine
   + skeleton overlay renderer.
   Mirrors the FastAPI backend payload shape so the UI never drifts:
   { camera_id, view, timestamp, fps, inference_ms, confidence,
     landmarks, angles, gait_metrics, posture_scores, overall_score }
   ============================================================ */
'use strict';

/* ---------------- Landmark map (BlazePose indices) ---------------- */
const LM = {
  NOSE: 0, L_EYE: 2, R_EYE: 5, L_EAR: 7, R_EAR: 8,
  L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30, L_FOOT: 31, R_FOOT: 32
};

const SKELETON = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
  [0, 7], [0, 8]
];

/* ---------------- Default scoring thresholds (green/yellow/red) ----------------
   Each metric: ideal [min,max] = green, warn [min,max] = yellow, else red. */
const DEFAULT_THRESHOLDS = {
  left_knee_angle:   { ideal: [155, 178], warn: [140, 180], unit: '°', label: 'Left Knee' },
  right_knee_angle:  { ideal: [155, 178], warn: [140, 180], unit: '°', label: 'Right Knee' },
  left_hip_angle:    { ideal: [150, 180], warn: [130, 180], unit: '°', label: 'Left Hip' },
  right_hip_angle:   { ideal: [150, 180], warn: [130, 180], unit: '°', label: 'Right Hip' },
  left_elbow_angle:  { ideal: [70, 120],  warn: [50, 150],  unit: '°', label: 'Left Elbow' },
  right_elbow_angle: { ideal: [70, 120],  warn: [50, 150],  unit: '°', label: 'Right Elbow' },
  trunk_lean:        { ideal: [0, 8],     warn: [0, 15],    unit: '°', label: 'Trunk Lean' },
  head_tilt:         { ideal: [0, 6],     warn: [0, 12],    unit: '°', label: 'Head Tilt' },
  pelvic_tilt:       { ideal: [0, 5],     warn: [0, 10],    unit: '°', label: 'Pelvic Tilt' },
  shoulder_tilt:     { ideal: [0, 5],     warn: [0, 10],    unit: '°', label: 'Shoulder Tilt' },
  cadence:           { ideal: [155, 185], warn: [130, 200], unit: 'spm', label: 'Cadence' },
  symmetry:          { ideal: [90, 100],  warn: [75, 100],  unit: '%', label: 'L/R Symmetry' },
  vertical_oscillation: { ideal: [0, 4],  warn: [0, 7],     unit: '%', label: 'Vertical Osc.' }
};

const THRESHOLD_KEY = 'ndurance.thresholds';

const Thresholds = {
  current: null,
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(THRESHOLD_KEY) || 'null');
      this.current = saved ? { ...structuredClone(DEFAULT_THRESHOLDS), ...saved } : structuredClone(DEFAULT_THRESHOLDS);
    } catch { this.current = structuredClone(DEFAULT_THRESHOLDS); }
    return this.current;
  },
  save(t) { this.current = t; localStorage.setItem(THRESHOLD_KEY, JSON.stringify(t)); },
  reset() { localStorage.removeItem(THRESHOLD_KEY); return this.load(); }
};
Thresholds.load();

/* ---------------- Biomechanics: joint angle math ---------------- */
const Bio = {
  angle(a, b, c) { // angle at b, degrees
    const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
    const d = v1[0] * v2[0] + v1[1] * v2[1];
    const m = Math.hypot(...v1) * Math.hypot(...v2);
    if (!m) return 0;
    return Math.acos(U.clamp(d / m, -1, 1)) * 180 / Math.PI;
  },
  tiltFromHorizontal(p1, p2) {
    return Math.abs(Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI);
  },
  leanFromVertical(top, bottom) {
    return Math.abs(Math.atan2(top.x - bottom.x, bottom.y - top.y) * 180 / Math.PI);
  },
  mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; },

  computeAngles(lms) {
    const p = i => lms[i];
    const midSh = this.mid(p(LM.L_SHOULDER), p(LM.R_SHOULDER));
    const midHip = this.mid(p(LM.L_HIP), p(LM.R_HIP));
    return {
      left_knee_angle: this.angle(p(LM.L_HIP), p(LM.L_KNEE), p(LM.L_ANKLE)),
      right_knee_angle: this.angle(p(LM.R_HIP), p(LM.R_KNEE), p(LM.R_ANKLE)),
      left_hip_angle: this.angle(p(LM.L_SHOULDER), p(LM.L_HIP), p(LM.L_KNEE)),
      right_hip_angle: this.angle(p(LM.R_SHOULDER), p(LM.R_HIP), p(LM.R_KNEE)),
      left_elbow_angle: this.angle(p(LM.L_SHOULDER), p(LM.L_ELBOW), p(LM.L_WRIST)),
      right_elbow_angle: this.angle(p(LM.R_SHOULDER), p(LM.R_ELBOW), p(LM.R_WRIST)),
      left_ankle_angle: this.angle(p(LM.L_KNEE), p(LM.L_ANKLE), p(LM.L_FOOT)),
      right_ankle_angle: this.angle(p(LM.R_KNEE), p(LM.R_ANKLE), p(LM.R_FOOT)),
      trunk_lean: this.leanFromVertical(midSh, midHip),
      head_tilt: this.tiltFromHorizontal(p(LM.L_EAR), p(LM.R_EAR)),
      pelvic_tilt: this.tiltFromHorizontal(p(LM.L_HIP), p(LM.R_HIP)),
      shoulder_tilt: this.tiltFromHorizontal(p(LM.L_SHOULDER), p(LM.R_SHOULDER))
    };
  }
};

/* ---------------- Gait analyser (step / cadence / symmetry) ---------------- */
class GaitAnalyzer {
  constructor() { this.reset(); }
  reset() {
    this.stepCount = 0;
    this.stepEvents = [];        // {t, foot}
    this.lastSep = 0; this.rising = false;
    this.hipYs = []; this.hipSpan = [];
    this.startT = null;
  }
  update(lms, t) {
    if (this.startT === null) this.startT = t;
    const la = lms[LM.L_ANKLE], ra = lms[LM.R_ANKLE];
    const lh = lms[LM.L_HIP], rh = lms[LM.R_HIP];
    const midHipY = (lh.y + rh.y) / 2;
    const bodyScale = Math.abs(((lms[LM.L_SHOULDER].y + lms[LM.R_SHOULDER].y) / 2) - midHipY) || 0.25;

    // step detection: peaks of normalized ankle separation
    const sep = Math.hypot(la.x - ra.x, la.y - ra.y) / bodyScale;
    if (sep > this.lastSep + 0.005) this.rising = true;
    else if (this.rising && sep < this.lastSep - 0.005 && this.lastSep > 0.55) {
      this.rising = false;
      const last = this.stepEvents[this.stepEvents.length - 1];
      if (!last || t - last.t > 0.25) { // debounce 250ms
        const foot = la.y > ra.y ? 'L' : 'R';
        this.stepEvents.push({ t, foot });
        this.stepCount++;
      }
    }
    this.lastSep = sep;

    // vertical oscillation of hip midpoint (% of trunk length)
    this.hipYs.push({ t, y: midHipY, scale: bodyScale });
    while (this.hipYs.length && t - this.hipYs[0].t > 4) this.hipYs.shift();

    return this.metrics(t);
  }
  metrics(t) {
    const recent = this.stepEvents.filter(e => t - e.t <= 10);
    let cadence = 0;
    if (recent.length >= 2) {
      const span = recent[recent.length - 1].t - recent[0].t;
      if (span > 0.5) cadence = ((recent.length - 1) / span) * 60;
    }
    // symmetry: compare mean interval L vs R
    const intervals = { L: [], R: [] };
    for (let i = 1; i < recent.length; i++) {
      const e = recent[i];
      intervals[e.foot].push(e.t - recent[i - 1].t);
    }
    let symmetry = 100;
    if (intervals.L.length && intervals.R.length) {
      const l = U.avg(intervals.L), r = U.avg(intervals.R);
      symmetry = 100 * (1 - Math.abs(l - r) / Math.max(l, r, 0.001));
    }
    let vosc = 0;
    if (this.hipYs.length > 5) {
      const ys = this.hipYs.map(h => h.y);
      const scale = U.avg(this.hipYs.map(h => h.scale));
      vosc = ((Math.max(...ys) - Math.min(...ys)) / (scale || 1)) * 25; // % of trunk-normalised
    }
    const stride = recent.length >= 3 ? (recent[recent.length - 1].t - recent[recent.length - 3].t) : 0;
    return {
      step_count: this.stepCount,
      cadence: U.round(cadence, 1),
      symmetry: U.round(U.clamp(symmetry, 0, 100), 1),
      vertical_oscillation: U.round(U.clamp(vosc, 0, 20), 2),
      stride_time_s: U.round(stride, 2),
      elapsed_s: U.round(this.startT === null ? 0 : t - this.startT, 1)
    };
  }
}

/* ---------------- Scoring engine (green / yellow / red) ---------------- */
const Scoring = {
  scoreMetric(value, th) {
    const [gi, ga] = th.ideal, [wi, wa] = th.warn;
    if (value >= gi && value <= ga) {
      // 85–100 inside ideal band (peak at centre)
      const centre = (gi + ga) / 2, half = Math.max((ga - gi) / 2, 0.001);
      return U.clamp(100 - (Math.abs(value - centre) / half) * 15, 85, 100);
    }
    if (value >= wi && value <= wa) {
      // 60–85 in warn band
      const dist = value < gi ? (gi - value) / Math.max(gi - wi, 0.001) : (value - ga) / Math.max(wa - ga, 0.001);
      return U.clamp(85 - dist * 25, 60, 85);
    }
    // red zone: 0–60 falling off
    const edge = value < wi ? wi - value : value - wa;
    const span = Math.max((wa - wi) * 0.5, 1);
    return U.clamp(60 - (edge / span) * 40, 5, 60);
  },
  zone(score) { return score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'; },

  score(angles, gait) {
    const th = Thresholds.current || Thresholds.load();
    const merged = { ...angles, ...gait };
    const scores = {};
    for (const key of Object.keys(th)) {
      const v = merged[key];
      if (v === undefined || v === null || (key === 'cadence' && v === 0)) continue;
      scores[key] = U.round(this.scoreMetric(v, th[key]), 1);
    }
    const vals = Object.values(scores);
    const overall = vals.length ? U.avg(vals) : 0;
    return {
      posture_scores: scores,
      overall_score: { overall_score: U.round(overall, 1), grade: U.gradeOf(overall) }
    };
  }
};

/* ---------------- Skeleton overlay renderer ---------------- */
const Renderer = {
  draw(canvas, lms, video, score) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = video.videoWidth || canvas.clientWidth;
    const h = canvas.height = video.videoHeight || canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!lms) return;
    const col = score >= 80 ? '#34D399' : score >= 60 ? '#FBBF24' : '#F87171';

    ctx.lineWidth = Math.max(2, w / 320);
    for (const [a, b] of SKELETON) {
      const pa = lms[a], pb = lms[b];
      if (!pa || !pb || (pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;
      const g = ctx.createLinearGradient(pa.x * w, pa.y * h, pb.x * w, pb.y * h);
      g.addColorStop(0, '#38BDF8'); g.addColorStop(1, '#8B5CF6');
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke();
    }
    const r = Math.max(3, w / 220);
    for (let i = 0; i < lms.length; i++) {
      const p = lms[i];
      if (!p || (p.visibility ?? 1) < 0.4) continue;
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
};

/* ---------------- PoseEngine: single landmarker, round-robin across cameras ---------------- */
const PoseEngine = {
  landmarker: null,
  loading: null,
  gaits: {},           // camera key -> GaitAnalyzer
  lastTs: 0,

  async init() {
    if (this.landmarker) return this.landmarker;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      const make = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
          delegate
        },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5
      });
      try { this.landmarker = await make('GPU'); }
      catch { this.landmarker = await make('CPU'); }
      return this.landmarker;
    })();
    return this.loading;
  },

  gaitFor(key) {
    if (!this.gaits[key]) this.gaits[key] = new GaitAnalyzer();
    return this.gaits[key];
  },
  resetGait() { this.gaits = {}; },

  /* Analyse one video frame → backend-shaped payload (or null if no pose) */
  analyze(video, camKey, view) {
    if (!this.landmarker || !video.videoWidth) return null;
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 0.1; // must be monotonic
    this.lastTs = ts;
    const t0 = performance.now();
    let result;
    try { result = this.landmarker.detectForVideo(video, ts); }
    catch { return null; }
    const inferMs = performance.now() - t0;
    const lms = result && result.landmarks && result.landmarks[0];
    if (!lms || lms.length < 33) return { landmarks: null, inference_ms: U.round(inferMs, 1) };

    const angles = {};
    const raw = Bio.computeAngles(lms);
    for (const k in raw) angles[k] = U.round(raw[k], 1);
    const gait = this.gaitFor(camKey).update(lms, ts / 1000);
    const { posture_scores, overall_score } = Scoring.score(angles, gait);
    const confidence = U.round(U.avg(lms.map(p => p.visibility ?? 0.9)), 3);

    return {
      camera_id: camKey, view, timestamp: Date.now() / 1000,
      inference_ms: U.round(inferMs, 1), confidence,
      landmarks: lms, angles, gait_metrics: gait,
      posture_scores, overall_score
    };
  }
};

window.LM = LM;
window.Thresholds = Thresholds;
window.DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS;
window.Bio = Bio;
window.GaitAnalyzer = GaitAnalyzer;
window.Scoring = Scoring;
window.Renderer = Renderer;
window.PoseEngine = PoseEngine;
