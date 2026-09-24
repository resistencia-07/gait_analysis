/* ============================================================
   NDURANCE — Page renderers
   Each Pages.<name>(root, navigate) renders into #page-root.
   ============================================================ */
'use strict';

const Pages = {};

/* =============== LOGIN =============== */
Pages.login = function (root, navigate) {
  root.innerHTML = `
  <div class="auth-wrap">
    <section class="glass auth-card" id="login-card">
      <div class="auth-logo">
        <div class="brand-mark"><i class="fa-solid fa-person-running"></i></div>
        <div>
          <h1 class="display" style="font-size:26px;letter-spacing:.06em">NDUR<span class="grad-text">ANCE</span></h1>
          <p class="muted tiny" style="margin-top:6px">Gait &amp; Posture Analysis Platform</p>
        </div>
      </div>
      <form id="login-form" novalidate>
        <div class="field">
          <label for="login-user">Username or Email</label>
          <input class="input" id="login-user" type="text" autocomplete="username" placeholder="alex.runner" required>
        </div>
        <div class="field">
          <label for="login-pass">Password</label>
          <input class="input" id="login-pass" type="password" autocomplete="current-password" placeholder="••••••••" required>
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%;margin-top:8px" id="login-btn">
          <i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In
        </button>
      </form>
      <p class="muted tiny" style="text-align:center;margin-top:22px">
        New to NDURANCE? <a href="#" id="go-signup" style="color:var(--accent);text-decoration:none;font-weight:600">Create account</a>
      </p>
    </section>
  </div>`;

  root.querySelector('#go-signup').onclick = e => { e.preventDefault(); navigate('signup'); };
  root.querySelector('#login-form').onsubmit = async e => {
    e.preventDefault();
    const btn = root.querySelector('#login-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
    try {
      await Auth.login(root.querySelector('#login-user').value, root.querySelector('#login-pass').value);
      U.toast(`Welcome back, ${Auth.user.full_name || Auth.user.username}!`, 'ok');
      navigate('dashboard');
    } catch (err) {
      U.toast(err.message, 'err');
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
    }
  };
};

/* =============== SIGNUP (multi-step) =============== */
Pages.signup = function (root, navigate) {
  let step = 0;
  const data = {};
  const steps = [
    {
      title: 'Your identity',
      html: `
      <div class="field"><label for="su-name">Full Name</label><input class="input" id="su-name" placeholder="Alex Carter" value="${U.esc(data.fullName || '')}"></div>
      <div class="field"><label for="su-user">Username</label><input class="input" id="su-user" placeholder="alex.runner" value="${U.esc(data.username || '')}"></div>`,
      validate(r) {
        data.fullName = r.querySelector('#su-name').value.trim();
        data.username = r.querySelector('#su-user').value.trim();
        if (!data.fullName || !data.username) throw new Error('Name and username are required');
        if (!/^[a-zA-Z0-9._-]{3,}$/.test(data.username)) throw new Error('Username: 3+ chars, letters/digits/._- only');
      }
    },
    {
      title: 'Account credentials',
      html: `
      <div class="field"><label for="su-email">Email</label><input class="input" id="su-email" type="email" placeholder="alex@club.com" value="${U.esc(data.email || '')}"></div>
      <div class="field"><label for="su-pass">Password</label><input class="input" id="su-pass" type="password" placeholder="Min 6 characters"></div>
      <div class="field"><label for="su-pass2">Confirm Password</label><input class="input" id="su-pass2" type="password" placeholder="Repeat password"></div>`,
      validate(r) {
        data.email = r.querySelector('#su-email').value.trim();
        const p1 = r.querySelector('#su-pass').value, p2 = r.querySelector('#su-pass2').value;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw new Error('Enter a valid email');
        if (p1.length < 6) throw new Error('Password must be at least 6 characters');
        if (p1 !== p2) throw new Error('Passwords do not match');
        data.password = p1;
      }
    },
    {
      title: 'Body metrics',
      html: `
      <div class="input-row">
        <div class="field"><label for="su-age">Age</label><input class="input" id="su-age" type="number" min="8" max="100" placeholder="24" value="${data.age || ''}"></div>
        <div class="field"><label for="su-gender">Gender</label>
          <select class="input" id="su-gender">
            <option value="male">Male</option><option value="female">Female</option><option value="other" selected>Other</option>
          </select></div>
      </div>
      <div class="input-row">
        <div class="field"><label for="su-height">Height (cm)</label><input class="input" id="su-height" type="number" min="80" max="250" placeholder="178" value="${data.height || ''}"></div>
        <div class="field"><label for="su-weight">Weight (kg)</label><input class="input" id="su-weight" type="number" min="20" max="250" placeholder="72" value="${data.weight || ''}"></div>
      </div>`,
      validate(r) {
        data.age = r.querySelector('#su-age').value;
        data.gender = r.querySelector('#su-gender').value;
        data.height = r.querySelector('#su-height').value;
        data.weight = r.querySelector('#su-weight').value;
        if (!data.age || !data.height || !data.weight) throw new Error('Please fill all body metrics');
      }
    }
  ];

  function render() {
    root.innerHTML = `
    <div class="auth-wrap">
      <section class="glass auth-card">
        <div class="auth-logo">
          <div class="brand-mark"><i class="fa-solid fa-person-running"></i></div>
          <div><h1 class="display" style="font-size:22px">Create your account</h1>
          <p class="muted tiny" style="margin-top:5px">Step ${step + 1} of ${steps.length} — ${steps[step].title}</p></div>
        </div>
        <div class="steps">${steps.map((_, i) => `<div class="step-dash ${i <= step ? 'on' : ''}"></div>`).join('')}</div>
        <form id="su-form" novalidate>
          ${steps[step].html}
          <div class="flex" style="margin-top:22px">
            ${step > 0 ? '<button type="button" class="btn btn-ghost" id="su-back"><i class="fa-solid fa-arrow-left"></i> Back</button>' : ''}
            <button type="submit" class="btn btn-primary" id="su-next" style="flex:1">
              ${step === steps.length - 1 ? '<i class="fa-solid fa-check"></i> Create Account' : 'Continue <i class="fa-solid fa-arrow-right"></i>'}
            </button>
          </div>
        </form>
        <p class="muted tiny" style="text-align:center;margin-top:22px">
          Already registered? <a href="#" id="go-login" style="color:var(--accent);text-decoration:none;font-weight:600">Sign in</a>
        </p>
      </section>
    </div>`;
    if (step === 2) root.querySelector('#su-gender').value = data.gender || 'other';
    root.querySelector('#go-login').onclick = e => { e.preventDefault(); navigate('login'); };
    const back = root.querySelector('#su-back');
    if (back) back.onclick = () => { step--; render(); };
    root.querySelector('#su-form').onsubmit = async e => {
      e.preventDefault();
      try { steps[step].validate(root); } catch (err) { return U.toast(err.message, 'err'); }
      if (step < steps.length - 1) { step++; render(); return; }
      const btn = root.querySelector('#su-next');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating…';
      try {
        await Auth.register(data);
        U.toast('Account created — welcome to NDURANCE!', 'ok');
        navigate('dashboard');
      } catch (err) {
        U.toast(err.message, 'err'); btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Create Account';
      }
    };
  }
  render();
};

/* =============== DASHBOARD =============== */
Pages.dashboard = async function (root, navigate) {
  root.innerHTML = `
  <header class="topbar">
    <div>
      <h1 class="page-title">Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, <span class="grad-text">${U.esc((Auth.user.full_name || Auth.user.username).split(' ')[0])}</span></h1>
      <p class="page-sub">Here's your performance overview.</p>
    </div>
    <button class="btn btn-primary btn-lg" id="quick-start"><i class="fa-solid fa-bolt"></i> Start Test</button>
  </header>
  <div class="grid grid-4" id="stat-grid">
    ${[1, 2, 3, 4].map(() => '<div class="glass stat-card"><div class="stat-icon"><i class="fa-solid fa-spinner fa-spin"></i></div><div class="stat-value">—</div><div class="stat-label">Loading…</div></div>').join('')}
  </div>
  <div class="grid grid-2 mt" style="grid-template-columns: 1.6fr 1fr">
    <section class="glass card">
      <div class="card-title"><i class="fa-solid fa-chart-line"></i> Score Trend — recent sessions</div>
      <div class="chart-box"><canvas id="trend-chart"></canvas></div>
    </section>
    <section class="glass card">
      <div class="card-title"><i class="fa-solid fa-gauge-high"></i> Latest Session</div>
      <div id="latest-box" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></div>
    </section>
  </div>
  <section class="glass card mt">
    <div class="flex between mb">
      <div class="card-title" style="margin:0"><i class="fa-solid fa-clock-rotate-left"></i> Recent Sessions</div>
      <button class="btn btn-sm btn-ghost" id="see-all">View all <i class="fa-solid fa-arrow-right"></i></button>
    </div>
    <div id="recent-tbl"></div>
  </section>`;

  root.querySelector('#quick-start').onclick = () => navigate('capture');
  root.querySelector('#see-all').onclick = () => navigate('reports');

  let sessions = [];
  try {
    const res = await API.list('sessions', { limit: 1000 });
    sessions = (res.data || []).filter(s => !s.deleted && s.user_id === Auth.user.id && s.status === 'completed')
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  } catch { /* empty */ }

  const scores = sessions.map(s => s.overall_score || 0);
  const totalSteps = sessions.reduce((a, s) => { try { return a + (JSON.parse(s.summary_json || '{}').total_steps || 0); } catch { return a; } }, 0);
  const totalDur = sessions.reduce((a, s) => a + (s.duration_s || 0), 0);
  const stats = [
    { icon: 'fa-person-running', color: 'var(--primary)', val: sessions.length, label: 'Total Sessions' },
    { icon: 'fa-star', color: 'var(--yellow)', val: scores.length ? U.round(U.avg(scores), 1) : '—', label: 'Avg Score' },
    { icon: 'fa-shoe-prints', color: 'var(--accent)', val: totalSteps.toLocaleString(), label: 'Total Steps' },
    { icon: 'fa-stopwatch', color: 'var(--secondary)', val: U.fmtDur(totalDur), label: 'Time Analysed' }
  ];
  root.querySelector('#stat-grid').innerHTML = stats.map(s => `
    <div class="glass stat-card">
      <div class="stat-icon" style="color:${s.color}"><i class="fa-solid ${s.icon}"></i></div>
      <div class="stat-value">${s.val}</div><div class="stat-label">${s.label}</div>
    </div>`).join('');

  // trend chart
  const recent = sessions.slice(0, 12).reverse();
  const ctx = root.querySelector('#trend-chart');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: recent.length ? recent.map(s => new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) : ['—'],
      datasets: [{
        label: 'Overall score', data: recent.length ? recent.map(s => s.overall_score || 0) : [0],
        borderColor: '#8B5CF6', tension: 0.4, fill: true, pointBackgroundColor: '#FF6B9D',
        backgroundColor: (c) => { const g = c.chart.ctx.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, 'rgba(139,92,246,0.35)'); g.addColorStop(1, 'rgba(139,92,246,0)'); return g; }
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: 'rgba(245,245,247,0.5)' } },
        x: { grid: { display: false }, ticks: { color: 'rgba(245,245,247,0.5)' } }
      }
    }
  });

  // latest session box
  const latestBox = root.querySelector('#latest-box');
  if (sessions.length) {
    const s = sessions[0];
    let sum = {}; try { sum = JSON.parse(s.summary_json || '{}'); } catch {}
    latestBox.className = '';
    latestBox.innerHTML = `
      <div style="display:flex;justify-content:center;margin-bottom:18px">${U.ring(s.overall_score || 0, 130, 11, s.grade || U.gradeOf(s.overall_score || 0))}</div>
      <div class="metric-row"><span class="m-name"><i class="fa-solid fa-gauge muted"></i> Cadence</span><span class="m-val">${sum.avg_cadence || 0} spm</span></div>
      <div class="metric-row"><span class="m-name"><i class="fa-solid fa-scale-balanced muted"></i> Symmetry</span><span class="m-val">${sum.avg_symmetry || 0}%</span></div>
      <div class="metric-row"><span class="m-name"><i class="fa-solid fa-shoe-prints muted"></i> Steps</span><span class="m-val">${sum.total_steps || 0}</span></div>
      <div class="metric-row"><span class="m-name"><i class="fa-solid fa-clock muted"></i> Duration</span><span class="m-val">${U.fmtDur(s.duration_s)}</span></div>
      <button class="btn btn-sm mt" style="width:100%" data-open="${s.id}"><i class="fa-solid fa-chart-column"></i> Open full stats</button>`;
    latestBox.querySelector('[data-open]').onclick = () => navigate('session-stats', { sessionId: s.id });
  } else {
    latestBox.innerHTML = '<i class="fa-solid fa-person-running"></i>No sessions yet.<br>Run your first gait test to see live metrics here.';
  }

  // recent table
  const tblBox = root.querySelector('#recent-tbl');
  if (sessions.length) {
    tblBox.innerHTML = `<table class="tbl"><thead><tr><th>Date</th><th>Duration</th><th>Steps</th><th>Cadence</th><th>Score</th><th></th></tr></thead>
      <tbody>${sessions.slice(0, 6).map(s => {
        let sum = {}; try { sum = JSON.parse(s.summary_json || '{}'); } catch {}
        return `<tr data-id="${s.id}"><td>${U.fmtDate(s.started_at)}</td><td>${U.fmtDur(s.duration_s)}</td>
          <td>${sum.total_steps || 0}</td><td>${sum.avg_cadence || 0} spm</td>
          <td><span class="badge ${U.scoreBadge(s.overall_score || 0)}">${U.round(s.overall_score || 0, 1)} · ${s.grade || '—'}</span></td>
          <td class="muted"><i class="fa-solid fa-chevron-right"></i></td></tr>`;
      }).join('')}</tbody></table>`;
    tblBox.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => navigate('session-stats', { sessionId: tr.dataset.id }));
  } else {
    tblBox.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i>No sessions recorded yet.</div>';
  }
};

/* =============== CAPTURE LAB =============== */
Pages.capture = async function (root, navigate) {
  root.innerHTML = `
  <header class="topbar">
    <div><h1 class="page-title">Capture <span class="grad-text">Lab</span></h1>
      <p class="page-sub">Connect up to 3 USB cameras — LEFT · BACK · RIGHT — then start your gait test.</p></div>
    <div class="flex">
      <button class="btn" id="btn-fullscreen" title="Open camera wall on a secondary display"><i class="fa-solid fa-display"></i> Second Display</button>
      <button class="btn btn-primary btn-lg" id="btn-session" disabled><i class="fa-solid fa-circle"></i> Start Test</button>
    </div>
  </header>

  <div class="grid" style="grid-template-columns: 300px 1fr; gap:20px">
    <aside>
      <section class="glass card" id="checklist-card">
        <div class="card-title"><i class="fa-solid fa-list-check"></i> Session Checklist</div>
        <div class="checklist-item" id="ck-cams"><span class="ck"><i class="fa-solid fa-check"></i></span> Cameras detected <span id="ck-cam-count" class="badge" style="margin-left:auto">0/3</span></div>
        <div class="checklist-item" id="ck-stream"><span class="ck"><i class="fa-solid fa-check"></i></span> Streams live</div>
        <div class="checklist-item" id="ck-pose"><span class="ck"><i class="fa-solid fa-check"></i></span> Pose model loaded</div>
        <div class="checklist-item" id="ck-athlete"><span class="ck"><i class="fa-solid fa-check"></i></span> Athlete in frame</div>
        <button class="btn btn-sm mt" style="width:100%" id="btn-detect"><i class="fa-solid fa-magnifying-glass"></i> Detect Cameras</button>
        <div id="cam-assign" class="mt"></div>
      </section>

      <section class="glass card mt" id="live-panel">
        <div class="card-title"><i class="fa-solid fa-wave-square"></i> Live Metrics</div>
        <div style="display:flex;justify-content:center;margin-bottom:14px" id="live-ring">${U.ring(0, 120, 10, '—')}</div>
        <div class="metric-row"><span class="m-name">Cadence</span><span class="m-val" id="lv-cadence">— spm</span></div>
        <div class="metric-row"><span class="m-name">Steps</span><span class="m-val" id="lv-steps">—</span></div>
        <div class="metric-row"><span class="m-name">Symmetry</span><span class="m-val" id="lv-sym">—%</span></div>
        <div class="metric-row"><span class="m-name">Trunk Lean</span><span class="m-val" id="lv-trunk">—°</span></div>
        <div class="metric-row"><span class="m-name">Inference</span><span class="m-val" id="lv-inf">— ms</span></div>
      </section>
    </aside>

    <div>
      <div class="glass-soft flex between" style="padding:14px 20px;margin-bottom:16px;border-radius:18px">
        <div class="flex"><span class="dot" id="rec-dot" style="background:rgba(255,255,255,0.2)"></span>
          <span id="rec-state" class="muted" style="font-size:14px">Idle — cameras off</span></div>
        <span class="rec-timer" id="rec-timer" style="font-size:22px">00:00</span>
      </div>
      <div class="cam-grid" id="cam-grid">
        ${VIEWS.map(v => `
          <div class="cam-tile offline" id="tile-${v}">
            <div class="cam-label"><span class="view-chip ${v}">${v}</span></div>
            <div class="off-msg"><i class="fa-solid fa-video-slash"></i>No camera</div>
          </div>`).join('')}
      </div>
      <section class="glass card mt">
        <div class="card-title"><i class="fa-solid fa-ruler-combined"></i> Joint Angles (live)</div>
        <div class="grid grid-3" id="angle-grid" style="gap:12px">
          <div class="empty-state" style="grid-column:1/-1;padding:24px"><i class="fa-solid fa-bone"></i>Start the cameras to stream joint angles.</div>
        </div>
      </section>
    </div>
  </div>`;

  const $ = sel => root.querySelector(sel);
  const ck = (id, on) => { const el = $(id); if (el) el.classList.toggle('done', !!on); };
  let camerasOn = false, recording = false, timerInt = null, rotationSyncInt = null;

  // apply a rotation angle to a tile's video+overlay wrapper (visual only — landmarks
  // are drawn onto the same canvas that rotates with it, so overlay stays aligned)
  function applyTileRotation(view, deg) {
    const visual = $(`#tile-${view} .cam-visual`);
    if (visual) visual.style.transform = deg ? `rotate(${deg}deg)` : '';
  }

  // rotation can also be changed from the popped-out "Second Display" window
  // (they share the same CameraManager.rotations object) — poll so this tab
  // reflects that too, without needing a full stream re-bind.
  function startRotationSync() {
    clearInterval(rotationSyncInt);
    rotationSyncInt = setInterval(() => {
      VIEWS.forEach(v => applyTileRotation(v, CameraManager.getRotation(v)));
    }, 700);
  }

  function renderAssign() {
    const box = $('#cam-assign');
    if (!CameraManager.devices.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<label class="tiny muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:600">View assignment</label>' +
      CameraManager.devices.map(d => `
      <div class="flex" style="margin-top:9px;gap:8px">
        <span class="tiny" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(d.label)}">${U.esc(d.label)}</span>
        <select class="input" style="width:92px;padding:7px 10px;font-size:12px" data-dev="${d.deviceId}">
          ${VIEWS.map(v => `<option value="${v}" ${d.view === v ? 'selected' : ''}>${v.toUpperCase()}</option>`).join('')}
        </select>
      </div>`).join('');
    box.querySelectorAll('select[data-dev]').forEach(sel => sel.onchange = () => {
      CameraManager.assignView(sel.dataset.dev, sel.value);
      renderAssign();
      if (camerasOn) startCameras(); // re-bind streams to new tiles
    });
  }

  async function detect() {
    const btn = $('#btn-detect');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting…';
    try {
      const devs = await CameraManager.discover();
      $('#ck-cam-count').textContent = `${devs.length}/3`;
      ck('#ck-cams', devs.length > 0);
      renderAssign();
      U.toast(`${devs.length} camera${devs.length === 1 ? '' : 's'} detected`, devs.length ? 'ok' : 'err');
      if (devs.length) await startCameras();
    } catch (e) { U.toast(e.message, 'err'); }
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Detect Cameras';
  }

  async function startCameras() {
    CameraManager.stopAnalysis();
    // build tiles
    const videoEls = {}, overlayEls = {};
    for (const d of CameraManager.devices) {
      const tile = $(`#tile-${d.view}`);
      if (!tile) continue;
      tile.classList.remove('offline');
      tile.innerHTML = `
        <div class="cam-visual">
          <video autoplay muted playsinline webkit-playsinline></video>
          <canvas class="overlay"></canvas>
        </div>
        <div class="cam-label"><span class="view-chip ${d.view}">${d.view}</span></div>
        <button type="button" class="cam-rotate-btn" data-view="${d.view}" title="Rotate ${d.view} camera 90°"><i class="fa-solid fa-rotate"></i></button>
        <div class="cam-foot"><span>${U.esc(d.label)}</span><span id="fps-${d.view}">— fps</span></div>`;
      videoEls[d.view] = tile.querySelector('video');
      overlayEls[d.view] = tile.querySelector('canvas.overlay');
      applyTileRotation(d.view, CameraManager.getRotation(d.view));
      tile.querySelector('.cam-rotate-btn').onclick = (e) => {
        e.stopPropagation();
        const deg = CameraManager.rotateView(d.view);
        applyTileRotation(d.view, deg);
      };
    }
    startRotationSync();
    try {
      $('#rec-state').textContent = 'Starting streams…';
      const views = await CameraManager.start(videoEls, overlayEls);
      camerasOn = true;
      ck('#ck-stream', true);
      showTileErrors(views.errors || {});
      $('#rec-state').textContent = 'Loading pose model…';
      await CameraManager.startAnalysis(onPayload);
      ck('#ck-pose', true);
      const failCount = Object.keys(views.errors || {}).length;
      $('#rec-state').textContent = failCount
        ? `Live preview — ${views.length} camera${views.length === 1 ? '' : 's'} (${failCount} failed — see tile)`
        : `Live preview — ${views.length} camera${views.length === 1 ? '' : 's'}`;
      $('#rec-dot').className = 'dot dot-live';
      $('#btn-session').disabled = false;
    } catch (e) { U.toast(e.message, 'err'); $('#rec-state').textContent = 'Camera error'; }
  }

  function showTileErrors(errors) {
    for (const d of CameraManager.devices) {
      const tile = $(`#tile-${d.view}`);
      if (!tile) continue;
      const existing = tile.querySelector('.cam-error');
      if (existing) existing.remove();
      const msg = errors[d.view];
      if (!msg) continue;
      const banner = document.createElement('div');
      banner.className = 'cam-error';
      banner.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,0,.72);color:#fff;text-align:center;padding:12px;font-size:12px;border-radius:inherit;z-index:2';
      banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size:20px;color:#f87171"></i>
        <span>${U.esc(msg)}</span>
        <button type="button" class="btn" style="padding:6px 12px;font-size:12px" data-retry="${d.view}">Retry this camera</button>`;
      tile.style.position = 'relative';
      tile.appendChild(banner);
      banner.querySelector('[data-retry]').onclick = async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'Retrying…';
        try {
          await CameraManager.retryView(d.view);
          banner.remove();
          U.toast(`${d.view.toUpperCase()} camera connected`, 'ok');
        } catch (err) {
          btn.disabled = false; btn.textContent = 'Retry this camera';
          U.toast(err.message || 'Retry failed', 'err');
        }
      };
    }
  }

  let lastUi = 0;
  function onPayload(view, p) {
    if (!p.landmarks) return;
    ck('#ck-athlete', true);
    const fpsEl = $(`#fps-${view}`);
    if (fpsEl) fpsEl.textContent = `${p.fps || 0} fps · ${p.inference_ms} ms`;
    const now = performance.now();
    if (now - lastUi < 200) return; // throttle UI to 5Hz
    lastUi = now;
    const best = CameraManager.bestPayload() || p;
    $('#live-ring').innerHTML = U.ring(best.overall_score.overall_score, 120, 10, best.overall_score.grade);
    $('#lv-cadence').textContent = `${best.gait_metrics.cadence} spm`;
    $('#lv-steps').textContent = best.gait_metrics.step_count;
    $('#lv-sym').textContent = `${best.gait_metrics.symmetry}%`;
    $('#lv-trunk').textContent = `${best.angles.trunk_lean}°`;
    $('#lv-inf').textContent = `${best.inference_ms} ms`;
    // angle grid
    const th = Thresholds.current;
    $('#angle-grid').innerHTML = Object.entries(best.angles).slice(0, 12).map(([k, v]) => {
      const sc = best.posture_scores[k];
      const col = sc === undefined ? 'var(--text-dim)' : U.scoreColor(sc);
      const label = (th[k] && th[k].label) || k.replace(/_/g, ' ');
      return `<div class="glass-soft" style="padding:12px 14px">
        <div class="tiny muted" style="text-transform:capitalize">${U.esc(label)}</div>
        <div class="flex between" style="margin-top:5px">
          <span class="m-val" style="font-size:19px;color:${col}">${v}°</span>
          ${sc !== undefined ? `<span class="badge ${U.scoreBadge(sc)}" style="font-size:10px;padding:3px 9px">${Math.round(sc)}</span>` : ''}
        </div></div>`;
    }).join('');
  }

  async function toggleSession() {
    const btn = $('#btn-session');
    if (!recording) {
      if (!camerasOn) return U.toast('Start cameras first', 'err');
      btn.disabled = true;
      try {
        await LiveSession.start(Auth.user);
        recording = true;
        btn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop &amp; Save';
        btn.classList.remove('btn-primary'); btn.classList.add('btn-danger');
        $('#rec-state').innerHTML = '<b style="color:var(--red)">RECORDING</b> — all cameras + metrics';
        const t0 = Date.now();
        timerInt = setInterval(() => { $('#rec-timer').textContent = U.fmtDur((Date.now() - t0) / 1000); }, 500);
        U.toast('Session recording started', 'ok');
      } catch (e) { U.toast(e.message, 'err'); }
      btn.disabled = false;
    } else {
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
      clearInterval(timerInt);
      try {
        const result = await LiveSession.stop();
        recording = false;
        // offer video downloads
        for (const [view, blob] of Object.entries(result.videoFiles || {})) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = `${view}.webm`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }
        U.toast('Session saved — videos downloaded as left/back/right.webm', 'ok');
        navigate('session-stats', { sessionId: result.sessionId });
        return;
      } catch (e) { U.toast(e.message, 'err'); }
      btn.disabled = false;
    }
  }

  $('#btn-detect').onclick = detect;
  $('#btn-session').onclick = toggleSession;
  $('#btn-fullscreen').onclick = async () => {
    let features = 'popup=1,width=1280,height=760';
    try {
      if ('getScreenDetails' in window) {
        const det = await window.getScreenDetails();
        const sec = det.screens.find(s => !s.isPrimary);
        if (sec) features = `popup=1,left=${sec.availLeft},top=${sec.availTop},width=${sec.availWidth},height=${sec.availHeight}`;
      }
    } catch { /* permission denied — plain popup */ }
    window.open('camera.html', 'ndurance-camera', features);
    U.toast('Camera wall opened — drag to your second display if needed', 'info');
  };

  // auto-detect on load
  detect();

  // page teardown
  Pages._teardown = () => {
    clearInterval(timerInt);
    clearInterval(rotationSyncInt);
    if (LiveSession.active) LiveSession.stop().catch(() => {});
    CameraManager.stop();
  };
};

/* =============== SESSION STATS =============== */
Pages['session-stats'] = async function (root, navigate, params = {}) {
  root.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i>Loading session…</div>';
  let session = null;
  try {
    if (params.sessionId) session = await API.get('sessions', params.sessionId);
    else {
      const res = await API.list('sessions', { limit: 1000 });
      session = (res.data || []).filter(s => !s.deleted && s.user_id === Auth.user.id && s.status === 'completed')
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
    }
  } catch { }
  if (!session) {
    root.innerHTML = `<header class="topbar"><div><h1 class="page-title">Session Stats</h1></div></header>
      <div class="glass card empty-state"><i class="fa-solid fa-chart-simple"></i>No completed sessions yet.<br><br>
      <button class="btn btn-primary" id="go-cap"><i class="fa-solid fa-bolt"></i> Run a Test</button></div>`;
    root.querySelector('#go-cap').onclick = () => navigate('capture');
    return;
  }
  let sum = {}, timeline = [];
  try { sum = JSON.parse(session.summary_json || '{}'); } catch {}
  try { timeline = JSON.parse(session.timeline_json || '[]'); } catch {}
  const score = session.overall_score || 0;

  root.innerHTML = `
  <header class="topbar">
    <div><h1 class="page-title">Session <span class="grad-text">Stats</span></h1>
      <p class="page-sub">${U.esc(session.athlete_name || '')} · ${U.fmtDate(session.started_at)} · ${U.fmtDur(session.duration_s)}</p></div>
    <div class="flex">
      <button class="btn" id="btn-report"><i class="fa-solid fa-file-lines"></i> Generate Report</button>
      <button class="btn btn-primary" id="btn-again"><i class="fa-solid fa-rotate-right"></i> New Test</button>
    </div>
  </header>
  <div class="grid" style="grid-template-columns: 320px 1fr">
    <section class="glass card" style="text-align:center">
      <div class="card-title" style="justify-content:center"><i class="fa-solid fa-trophy"></i> Overall Performance</div>
      <div style="display:flex;justify-content:center">${U.ring(score, 170, 14, session.grade || U.gradeOf(score))}</div>
      <hr class="hr">
      <div class="metric-row"><span class="m-name">Avg Cadence</span><span class="m-val">${sum.avg_cadence ?? 0} spm</span></div>
      <div class="metric-row"><span class="m-name">Max Cadence</span><span class="m-val">${sum.max_cadence ?? 0} spm</span></div>
      <div class="metric-row"><span class="m-name">Total Steps</span><span class="m-val">${sum.total_steps ?? 0}</span></div>
      <div class="metric-row"><span class="m-name">L/R Symmetry</span><span class="m-val">${sum.avg_symmetry ?? 0}%</span></div>
      <div class="metric-row"><span class="m-name">Avg Trunk Lean</span><span class="m-val">${sum.avg_trunk_lean ?? 0}°</span></div>
      <div class="metric-row"><span class="m-name">Vertical Osc.</span><span class="m-val">${sum.avg_vosc ?? 0}%</span></div>
    </section>
    <div>
      <section class="glass card">
        <div class="card-title"><i class="fa-solid fa-chart-area"></i> Score Timeline</div>
        <div class="chart-box"><canvas id="ss-score"></canvas></div>
      </section>
      <div class="grid grid-2 mt">
        <section class="glass card">
          <div class="card-title"><i class="fa-solid fa-gauge"></i> Cadence &amp; Symmetry</div>
          <div class="chart-box" style="height:230px"><canvas id="ss-cad"></canvas></div>
        </section>
        <section class="glass card">
          <div class="card-title"><i class="fa-solid fa-bone"></i> Knee Angles</div>
          <div class="chart-box" style="height:230px"><canvas id="ss-knee"></canvas></div>
        </section>
      </div>
    </div>
  </div>`;

  root.querySelector('#btn-again').onclick = () => navigate('capture');
  root.querySelector('#btn-report').onclick = async () => {
    const btn = root.querySelector('#btn-report');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…';
    try {
      const report = {
        id: U.uuid(), session_id: session.id, user_id: Auth.user.id,
        athlete_name: session.athlete_name, generated_at: new Date().toISOString(),
        overall_score: score, grade: session.grade || U.gradeOf(score),
        report_json: JSON.stringify({ summary: sum, timeline_points: timeline.length, session: { started_at: session.started_at, duration_s: session.duration_s } })
      };
      await API.create('reports', report);
      U.toast('Report generated', 'ok');
      navigate('reports');
    } catch (e) { U.toast(e.message, 'err'); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-lines"></i> Generate Report'; }
  };

  const labels = timeline.map(p => U.fmtDur(p.t));
  const gridOpts = { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: 'rgba(245,245,247,0.5)', maxTicksLimit: 8 } };
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'rgba(245,245,247,0.7)' } } }, scales: { y: gridOpts, x: gridOpts } };

  new Chart(root.querySelector('#ss-score'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Overall score', data: timeline.map(p => p.overall), borderColor: '#FF6B9D', tension: 0.35, fill: true, pointRadius: 0, backgroundColor: 'rgba(255,107,157,0.12)' }] },
    options: { ...base, scales: { ...base.scales, y: { ...gridOpts, min: 0, max: 100 } } }
  });
  new Chart(root.querySelector('#ss-cad'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Cadence (spm)', data: timeline.map(p => p.cadence), borderColor: '#38BDF8', tension: 0.35, pointRadius: 0 },
      { label: 'Symmetry (%)', data: timeline.map(p => p.symmetry), borderColor: '#34D399', tension: 0.35, pointRadius: 0 }
    ] }, options: base
  });
  new Chart(root.querySelector('#ss-knee'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Left knee (°)', data: timeline.map(p => p.left_knee), borderColor: '#8B5CF6', tension: 0.35, pointRadius: 0 },
      { label: 'Right knee (°)', data: timeline.map(p => p.right_knee), borderColor: '#FBBF24', tension: 0.35, pointRadius: 0 }
    ] }, options: base
  });
};

/* =============== ATHLETES =============== */
Pages.athletes = async function (root, navigate) {
  root.innerHTML = `<header class="topbar">
    <div><h1 class="page-title">Athletes</h1><p class="page-sub">Everyone registered on this NDURANCE studio.</p></div>
  </header><div class="grid grid-3" id="ath-grid"><div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-spinner fa-spin"></i></div></div>`;
  let users = [], sessions = [];
  try {
    const [u, s] = await Promise.all([API.list('users', { limit: 1000 }), API.list('sessions', { limit: 1000 })]);
    users = (u.data || []).filter(x => !x.deleted);
    sessions = (s.data || []).filter(x => !x.deleted && x.status === 'completed');
  } catch {}
  const grid = root.querySelector('#ath-grid');
  if (!users.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-users"></i>No athletes yet.</div>'; return; }
  grid.innerHTML = users.map(u => {
    const mine = sessions.filter(s => s.user_id === u.id);
    const avg = mine.length ? U.round(U.avg(mine.map(s => s.overall_score || 0)), 1) : null;
    return `<article class="glass card">
      <div class="flex" style="margin-bottom:16px">
        <div class="avatar">${U.initials(u.full_name || u.username)}</div>
        <div style="min-width:0"><b>${U.esc(u.full_name || u.username)}</b>
          <div class="tiny muted">@${U.esc(u.username)} ${u.id === Auth.user.id ? '· you' : ''}</div></div>
        ${avg !== null ? `<span class="badge ${U.scoreBadge(avg)}" style="margin-left:auto">${avg}</span>` : ''}
      </div>
      <div class="metric-row"><span class="m-name">Sessions</span><span class="m-val">${mine.length}</span></div>
      <div class="metric-row"><span class="m-name">Height / Weight</span><span class="m-val">${u.height_cm || '—'} cm · ${u.weight_kg || '—'} kg</span></div>
      <div class="metric-row"><span class="m-name">Age / Gender</span><span class="m-val">${u.age || '—'} · ${U.esc(u.gender || '—')}</span></div>
    </article>`;
  }).join('');
};

/* =============== REPORTS =============== */
Pages.reports = async function (root, navigate) {
  root.innerHTML = `<header class="topbar">
    <div><h1 class="page-title">Reports</h1><p class="page-sub">Generated performance reports — print or export as JSON.</p></div>
  </header><section class="glass card"><div id="rep-tbl"><div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></div></div></section>`;
  let reports = [];
  try {
    const res = await API.list('reports', { limit: 1000 });
    reports = (res.data || []).filter(r => !r.deleted && r.user_id === Auth.user.id)
      .sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
  } catch {}
  const box = root.querySelector('#rep-tbl');
  if (!reports.length) {
    box.innerHTML = '<div class="empty-state"><i class="fa-solid fa-file-circle-question"></i>No reports yet. Open a session and press "Generate Report".</div>';
    return;
  }
  box.innerHTML = `<table class="tbl"><thead><tr><th>Generated</th><th>Athlete</th><th>Score</th><th>Grade</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${reports.map(r => `<tr>
      <td>${U.fmtDate(r.generated_at)}</td><td>${U.esc(r.athlete_name || '—')}</td>
      <td><span class="badge ${U.scoreBadge(r.overall_score || 0)}">${U.round(r.overall_score || 0, 1)}</span></td>
      <td class="m-val">${U.esc(r.grade || '—')}</td>
      <td style="text-align:right">
        <button class="btn btn-sm" data-view="${r.id}"><i class="fa-solid fa-eye"></i></button>
        <button class="btn btn-sm" data-json="${r.id}" title="Export JSON"><i class="fa-solid fa-download"></i></button>
        <button class="btn btn-sm btn-danger" data-del="${r.id}"><i class="fa-solid fa-trash"></i></button>
      </td></tr>`).join('')}</tbody></table>`;

  box.querySelectorAll('[data-json]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const r = reports.find(x => x.id === b.dataset.json);
    U.downloadJSON({ ...r, report_json: JSON.parse(r.report_json || '{}') }, `ndurance-report-${r.id.slice(0, 8)}.json`);
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    await API.remove('reports', b.dataset.del);
    U.toast('Report deleted', 'ok');
    Pages.reports(root, navigate);
  });
  box.querySelectorAll('[data-view]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const r = reports.find(x => x.id === b.dataset.view);
    let body = {}; try { body = JSON.parse(r.report_json || '{}'); } catch {}
    const sum = body.summary || {};
    const veil = document.createElement('div');
    veil.className = 'modal-veil';
    veil.innerHTML = `<div class="glass modal-box">
      <div class="flex between mb"><h2 class="display" style="font-size:21px">Performance Report</h2>
        <button class="btn btn-icon btn-ghost" id="m-close"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="flex" style="gap:26px;flex-wrap:wrap">
        ${U.ring(r.overall_score || 0, 140, 12, r.grade)}
        <div style="flex:1;min-width:220px">
          <div class="metric-row"><span class="m-name">Athlete</span><span class="m-val">${U.esc(r.athlete_name || '—')}</span></div>
          <div class="metric-row"><span class="m-name">Generated</span><span class="m-val">${U.fmtDate(r.generated_at)}</span></div>
          <div class="metric-row"><span class="m-name">Avg Cadence</span><span class="m-val">${sum.avg_cadence ?? '—'} spm</span></div>
          <div class="metric-row"><span class="m-name">Symmetry</span><span class="m-val">${sum.avg_symmetry ?? '—'}%</span></div>
          <div class="metric-row"><span class="m-name">Total Steps</span><span class="m-val">${sum.total_steps ?? '—'}</span></div>
          <div class="metric-row"><span class="m-name">Duration</span><span class="m-val">${U.fmtDur(sum.duration_s)}</span></div>
        </div>
      </div>
      <div class="flex mt" style="justify-content:flex-end">
        <button class="btn" id="m-print"><i class="fa-solid fa-print"></i> Print / PDF</button>
        <button class="btn btn-primary" id="m-open"><i class="fa-solid fa-chart-column"></i> Open Session</button>
      </div></div>`;
    document.body.appendChild(veil);
    veil.onclick = ev => { if (ev.target === veil) veil.remove(); };
    veil.querySelector('#m-close').onclick = () => veil.remove();
    veil.querySelector('#m-print').onclick = () => window.print();
    veil.querySelector('#m-open').onclick = () => { veil.remove(); navigate('session-stats', { sessionId: r.session_id }); };
  });
};

/* =============== SETTINGS (threshold editor) =============== */
Pages.settings = function (root) {
  const th = Thresholds.current || Thresholds.load();
  root.innerHTML = `<header class="topbar">
    <div><h1 class="page-title">Settings</h1><p class="page-sub">Scoring thresholds — green (ideal) and yellow (acceptable) bands per metric. Values outside yellow score red.</p></div>
    <div class="flex">
      <button class="btn btn-ghost" id="th-reset"><i class="fa-solid fa-rotate-left"></i> Reset Defaults</button>
      <button class="btn btn-primary" id="th-save"><i class="fa-solid fa-floppy-disk"></i> Save Thresholds</button>
    </div></header>
  <section class="glass card">
    <table class="tbl"><thead><tr><th>Metric</th><th>Unit</th><th>Ideal min</th><th>Ideal max</th><th>Warn min</th><th>Warn max</th></tr></thead>
    <tbody id="th-body">${Object.entries(th).map(([k, t]) => `
      <tr data-k="${k}"><td style="text-transform:capitalize">${U.esc(t.label || k.replace(/_/g, ' '))}</td><td class="muted">${t.unit}</td>
        ${['ideal.0', 'ideal.1', 'warn.0', 'warn.1'].map(path => {
          const [arr, idx] = path.split('.');
          return `<td><input class="input" style="width:86px;padding:8px 10px" type="number" step="0.5" data-path="${path}" value="${t[arr][idx]}"></td>`;
        }).join('')}
      </tr>`).join('')}</tbody></table>
  </section>`;

  root.querySelector('#th-save').onclick = () => {
    const next = structuredClone(Thresholds.current);
    root.querySelectorAll('#th-body tr').forEach(tr => {
      const k = tr.dataset.k;
      tr.querySelectorAll('input[data-path]').forEach(inp => {
        const [arr, idx] = inp.dataset.path.split('.');
        next[k][arr][idx] = Number(inp.value);
      });
    });
    Thresholds.save(next);
    U.toast('Thresholds saved — applied live to the scoring engine', 'ok');
  };
  root.querySelector('#th-reset').onclick = () => {
    Thresholds.reset();
    U.toast('Thresholds reset to defaults', 'ok');
    Pages.settings(root);
  };
};

/* =============== PROFILE =============== */
Pages.profile = async function (root, navigate) {
  await Auth.refreshProfile();
  const u = Auth.user;
  let sessions = [];
  try {
    const res = await API.list('sessions', { limit: 1000 });
    sessions = (res.data || []).filter(s => !s.deleted && s.user_id === u.id && s.status === 'completed')
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  } catch {}

  root.innerHTML = `<header class="topbar">
    <div><h1 class="page-title">Profile</h1><p class="page-sub">Your account and body metrics used for analysis.</p></div>
  </header>
  <div class="grid" style="grid-template-columns: 380px 1fr">
    <section class="glass card">
      <div class="flex mb">
        <div class="avatar" style="width:58px;height:58px;font-size:21px">${U.initials(u.full_name || u.username)}</div>
        <div><b style="font-size:17px">${U.esc(u.full_name || u.username)}</b>
        <div class="tiny muted">@${U.esc(u.username)} · ${U.esc(u.email)}</div></div>
      </div>
      <form id="prof-form">
        <div class="input-row">
          <div class="field"><label for="pf-age">Age</label><input class="input" id="pf-age" type="number" value="${u.age || ''}"></div>
          <div class="field"><label for="pf-gender">Gender</label>
            <select class="input" id="pf-gender">
              <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select></div>
        </div>
        <div class="input-row">
          <div class="field"><label for="pf-height">Height (cm)</label><input class="input" id="pf-height" type="number" value="${u.height_cm || ''}"></div>
          <div class="field"><label for="pf-weight">Weight (kg)</label><input class="input" id="pf-weight" type="number" value="${u.weight_kg || ''}"></div>
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
      </form>
    </section>
    <section class="glass card">
      <div class="card-title"><i class="fa-solid fa-clock-rotate-left"></i> Session History (${sessions.length})</div>
      ${sessions.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Duration</th><th>Score</th><th></th></tr></thead>
        <tbody>${sessions.slice(0, 12).map(s => `<tr data-id="${s.id}">
          <td>${U.fmtDate(s.started_at)}</td><td>${U.fmtDur(s.duration_s)}</td>
          <td><span class="badge ${U.scoreBadge(s.overall_score || 0)}">${U.round(s.overall_score || 0, 1)} · ${s.grade || '—'}</span></td>
          <td class="muted"><i class="fa-solid fa-chevron-right"></i></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty-state"><i class="fa-solid fa-inbox"></i>No sessions yet.</div>'}
    </section>
  </div>`;

  root.querySelector('#pf-gender').value = u.gender || 'other';
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => navigate('session-stats', { sessionId: tr.dataset.id }));
  root.querySelector('#prof-form').onsubmit = async e => {
    e.preventDefault();
    try {
      await Auth.updateProfile({
        age: Number(root.querySelector('#pf-age').value) || null,
        gender: root.querySelector('#pf-gender').value,
        height_cm: Number(root.querySelector('#pf-height').value) || null,
        weight_kg: Number(root.querySelector('#pf-weight').value) || null
      });
      U.toast('Profile updated', 'ok');
    } catch (err) { U.toast(err.message, 'err'); }
  };
};

window.Pages = Pages;
