/* ============================================================
   NDURANCE — CameraManager
   Discovers up to 3 USB cameras via MediaDevices, assigns
   LEFT / BACK / RIGHT views, streams into <video> elements,
   records WebM per camera via MediaRecorder, and runs the
   PoseEngine loop (round-robin across active cameras).
   Broadcasts live payloads to other windows (fullscreen page)
   through a BroadcastChannel — the in-browser "/ws" stream.
   ============================================================ */
'use strict';

const VIEWS = ['left', 'back', 'right'];

const CameraManager = {
  devices: [],            // [{deviceId, label, view}]
  streams: {},            // view -> MediaStream
  videos: {},             // view -> HTMLVideoElement
  overlays: {},           // view -> canvas
  recorders: {},          // view -> MediaRecorder
  chunks: {},             // view -> Blob[]
  running: false,
  analysing: false,
  fpsCounters: {},        // view -> {frames, t0, fps}
  latest: {},             // view -> last payload
  onPayload: null,        // callback(view, payload)
  channel: null,
  _rrIndex: 0,
  _loopHandle: null,
  rotations: { left: 0, back: 0, right: 0 }, // view -> 0|90|180|270, shared across primary + secondary display

  bus() {
    if (!this.channel) this.channel = new BroadcastChannel('ndurance-live');
    return this.channel;
  },

  /* ---- discovery ---- */
  async discover() {
    // Need permission before labels are populated
    let probe = null;
    try {
      probe = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
      throw new Error('Camera permission denied or no camera found. Allow camera access and retry.');
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    probe.getTracks().forEach(t => t.stop());
    const cams = all.filter(d => d.kind === 'videoinput');
    this.devices = cams.slice(0, 3).map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
      view: VIEWS[i]
    }));
    return this.devices;
  },

  assignView(deviceId, view) {
    const target = this.devices.find(d => d.deviceId === deviceId);
    if (!target) return;
    const holder = this.devices.find(d => d.view === view && d.deviceId !== deviceId);
    if (holder) holder.view = target.view; // swap
    target.view = view;
  },

  /* ---- start/stop streams ---- */
  // Constraint tiers to try in order — 3 simultaneous USB webcams on one
  // hub/controller commonly can't sustain 1280x720@30fps each, so we fall
  // back to lighter modes instead of failing outright.
  _constraintTiers: [
    { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    { width: { ideal: 848 }, height: { ideal: 480 }, frameRate: { ideal: 20 } },
    { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }
  ],

  async _openDevice(dev) {
    let lastErr = null;
    for (const tier of this._constraintTiers) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: dev.deviceId }, ...tier },
          audio: false
        });
        return stream;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Camera could not be opened');
  },

  async start(videoEls, overlayEls) {
    this.videos = videoEls || {};
    this.overlays = overlayEls || {};
    if (!this.devices.length) await this.discover();
    const started = [];
    const errors = {};
    for (let i = 0; i < this.devices.length; i++) {
      const dev = this.devices[i];
      if (i > 0) await new Promise(r => setTimeout(r, 200)); // ease USB bandwidth contention between opens
      try {
        const stream = await this._openDevice(dev);
        this.streams[dev.view] = stream;
        const v = this.videos[dev.view];
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        this.fpsCounters[dev.view] = { frames: 0, t0: performance.now(), fps: 0 };
        started.push(dev.view);
      } catch (e) {
        const msg = e.name === 'NotReadableError'
          ? 'Camera busy or USB bandwidth limit reached — try a different USB port/hub'
          : (e.message || e.name || 'Unknown camera error');
        console.warn(`Camera ${dev.label} (${dev.view}) failed:`, msg);
        errors[dev.view] = msg;
      }
    }
    if (!started.length) throw new Error('No camera streams could be started.');
    this.running = true;
    started.errors = errors; // extra prop on the array — started.length/map still work as before
    return started;
  },

  /* Retry a single failed view without disturbing the others already running. */
  async retryView(view) {
    const dev = this.devices.find(d => d.view === view);
    if (!dev) throw new Error('No camera assigned to this view');
    const stream = await this._openDevice(dev);
    this.streams[view] = stream;
    const v = this.videos[view];
    if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
    this.fpsCounters[view] = { frames: 0, t0: performance.now(), fps: 0 };
    return true;
  },

  stop() {
    this.running = false;
    this.stopAnalysis();
    for (const view in this.streams) {
      this.streams[view].getTracks().forEach(t => t.stop());
    }
    this.streams = {};
    this.latest = {};
  },

  activeViews() { return Object.keys(this.streams); },

  /* ---- rotation (shared state — read directly by the popped-out
     camera.html window via window.opener.CameraManager, and polled
     by both windows so either side's rotate button stays in sync) ---- */
  getRotation(view) { return this.rotations[view] || 0; },

  rotateView(view) {
    const next = ((this.rotations[view] || 0) + 90) % 360;
    this.rotations[view] = next;
    try { this.bus().postMessage({ type: 'rotation', view, deg: next }); } catch {}
    return next;
  },

  /* ---- pose analysis loop (all active cameras analysed every frame,
     via the same shared landmarker instance, run back-to-back) ---- */
  async startAnalysis(onPayload) {
    this.onPayload = onPayload || null;
    await PoseEngine.init();
    PoseEngine.resetGait();
    this.analysing = true;
    const loop = () => {
      if (!this.analysing) return;
      const views = this.activeViews();
      for (const view of views) {
        const video = this.videos[view];
        if (!video || video.readyState < 2) continue;
        const payload = PoseEngine.analyze(video, view, view);
        const fc = this.fpsCounters[view];
        if (fc) {
          fc.frames++;
          const dt = performance.now() - fc.t0;
          if (dt >= 1000) { fc.fps = U.round(fc.frames * 1000 / dt, 1); fc.frames = 0; fc.t0 = performance.now(); }
        }
        if (payload) {
          payload.fps = fc ? fc.fps : 0;
          if (payload.landmarks) {
            this.latest[view] = payload;
            const overlay = this.overlays[view];
            if (overlay) Renderer.draw(overlay, payload.landmarks, video, payload.overall_score.overall_score);
            const { landmarks, ...light } = payload;
            try { this.bus().postMessage({ type: 'frame', view, payload: light }); } catch {}
            if (this.onPayload) this.onPayload(view, payload);
          } else {
            const overlay = this.overlays[view];
            if (overlay) Renderer.draw(overlay, null, video, 0);
          }
        }
      }
      this._loopHandle = requestAnimationFrame(loop);
    };
    this._loopHandle = requestAnimationFrame(loop);
  },

  stopAnalysis() {
    this.analysing = false;
    if (this._loopHandle) cancelAnimationFrame(this._loopHandle);
  },

  /* ---- best (highest-confidence) live payload across views ---- */
  bestPayload() {
    let best = null;
    for (const v in this.latest) {
      const p = this.latest[v];
      if (!best || p.confidence > best.confidence) best = p;
    }
    return best;
  },

  /* ---- recording ---- */
  startRecording() {
    this.chunks = {}; this.recorders = {};
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    for (const view of this.activeViews()) {
      try {
        const rec = new MediaRecorder(this.streams[view], { mimeType: mime, videoBitsPerSecond: 2_500_000 });
        this.chunks[view] = [];
        rec.ondataavailable = e => { if (e.data.size) this.chunks[view].push(e.data); };
        rec.start(1000);
        this.recorders[view] = rec;
      } catch (e) { console.warn('Recorder failed for', view, e); }
    }
  },

  async stopRecording() {
    const files = {};
    const stops = Object.entries(this.recorders).map(([view, rec]) => new Promise(res => {
      if (rec.state === 'inactive') return res();
      rec.onstop = () => res();
      rec.stop();
    }));
    await Promise.all(stops);
    for (const view in this.chunks) {
      if (this.chunks[view].length) files[view] = new Blob(this.chunks[view], { type: 'video/webm' });
    }
    this.recorders = {}; this.chunks = {};
    return files; // view -> Blob (downloadable as {view}.webm)
  }
};

/* ============================================================
   LiveSession — session lifecycle + aggregation
   Collects per-second snapshots, computes gait_summary, and
   persists to the sessions/reports tables on stop.
   ============================================================ */
const LiveSession = {
  active: null,           // {id, startedAt, snapshots:[], ...}
  _sampleTimer: null,

  async start(user) {
    const id = U.uuid();
    this.active = {
      id, userId: user.id, athleteName: user.full_name || user.username,
      startedAt: Date.now(), snapshots: [], status: 'recording'
    };
    CameraManager.startRecording();
    // sample the best payload once per second for the timeline
    this._sampleTimer = setInterval(() => {
      const p = CameraManager.bestPayload();
      if (p && this.active) {
        this.active.snapshots.push({
          t: U.round((Date.now() - this.active.startedAt) / 1000, 1),
          view: p.view,
          overall: p.overall_score.overall_score,
          cadence: p.gait_metrics.cadence,
          symmetry: p.gait_metrics.symmetry,
          step_count: p.gait_metrics.step_count,
          trunk_lean: p.angles.trunk_lean,
          left_knee: p.angles.left_knee_angle,
          right_knee: p.angles.right_knee_angle,
          vosc: p.gait_metrics.vertical_oscillation
        });
      }
    }, 1000);
    try { CameraManager.bus().postMessage({ type: 'session', state: 'recording', id }); } catch {}
    // persist shell record
    await API.create('sessions', {
      id, user_id: user.id, athlete_name: this.active.athleteName,
      started_at: new Date(this.active.startedAt).toISOString(),
      status: 'recording',
      camera_views: JSON.stringify(CameraManager.devices.map(d => ({ view: d.view, label: d.label })))
    });
    return this.active;
  },

  summary() {
    const s = this.active;
    if (!s || !s.snapshots.length) return null;
    const snaps = s.snapshots;
    const pick = k => snaps.map(x => x[k]).filter(v => typeof v === 'number');
    const overall = U.round(U.avg(pick('overall')), 1);
    const cadArr = pick('cadence').filter(v => v > 0);
    return {
      duration_s: U.round((Date.now() - s.startedAt) / 1000, 1),
      frames_sampled: snaps.length,
      avg_overall: overall,
      grade: U.gradeOf(overall),
      avg_cadence: U.round(U.avg(cadArr), 1),
      max_cadence: cadArr.length ? U.round(Math.max(...cadArr), 1) : 0,
      avg_symmetry: U.round(U.avg(pick('symmetry')), 1),
      total_steps: snaps.length ? Math.max(...pick('step_count')) : 0,
      avg_trunk_lean: U.round(U.avg(pick('trunk_lean')), 1),
      avg_vosc: U.round(U.avg(pick('vosc')), 2)
    };
  },

  async stop() {
    if (!this.active) return null;
    clearInterval(this._sampleTimer);
    const videoFiles = await CameraManager.stopRecording();
    const sum = this.summary() || { duration_s: U.round((Date.now() - this.active.startedAt) / 1000, 1), frames_sampled: 0, avg_overall: 0, grade: '—', avg_cadence: 0, max_cadence: 0, avg_symmetry: 0, total_steps: 0, avg_trunk_lean: 0, avg_vosc: 0 };
    const s = this.active;
    // downsample timeline to ≤ 240 points
    const step = Math.max(1, Math.ceil(s.snapshots.length / 240));
    const timeline = s.snapshots.filter((_, i) => i % step === 0);
    const record = await API.update('sessions', s.id, {
      stopped_at: new Date().toISOString(),
      duration_s: sum.duration_s,
      status: 'completed',
      summary_json: JSON.stringify(sum),
      timeline_json: JSON.stringify(timeline),
      overall_score: sum.avg_overall,
      grade: sum.grade
    }).catch(async () => {
      // fallback: create if the shell record failed earlier
      return API.create('sessions', {
        id: s.id, user_id: s.userId, athlete_name: s.athleteName,
        started_at: new Date(s.startedAt).toISOString(),
        stopped_at: new Date().toISOString(),
        duration_s: sum.duration_s, status: 'completed',
        summary_json: JSON.stringify(sum), timeline_json: JSON.stringify(timeline),
        overall_score: sum.avg_overall, grade: sum.grade
      });
    });
    try { CameraManager.bus().postMessage({ type: 'session', state: 'stopped', id: s.id }); } catch {}
    const result = { record, summary: sum, timeline, videoFiles, sessionId: s.id };
    this.active = null;
    return result;
  }
};

window.CameraManager = CameraManager;
window.LiveSession = LiveSession;
window.VIEWS = VIEWS;
