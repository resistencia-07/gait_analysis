/* ============================================================
   NDURANCE — App shell: state-based router + sidebar + auth guard
   ============================================================ */
'use strict';

const NAV = [
  { section: 'Studio' },
  { page: 'dashboard', icon: 'fa-house', label: 'Dashboard' },
  { page: 'capture', icon: 'fa-video', label: 'Capture Lab' },
  { page: 'session-stats', icon: 'fa-chart-column', label: 'Session Stats' },
  { section: 'Manage' },
  { page: 'athletes', icon: 'fa-users', label: 'Athletes' },
  { page: 'reports', icon: 'fa-file-lines', label: 'Reports' },
  { page: 'settings', icon: 'fa-sliders', label: 'Settings' }
];

const App = {
  page: 'login',
  params: {},

  navigate(page, params = {}) {
    // teardown for pages holding camera resources
    if (Pages._teardown) { try { Pages._teardown(); } catch {} Pages._teardown = null; }
    this.page = page;
    this.params = params;
    this.render();
  },

  render() {
    const appEl = document.getElementById('app');
    const isAuthPage = this.page === 'login' || this.page === 'signup';

    if (!Auth.isAuthenticated && !isAuthPage) { this.page = 'login'; }
    if (Auth.isAuthenticated && isAuthPage) { this.page = 'dashboard'; }

    if (this.page === 'login' || this.page === 'signup') {
      appEl.innerHTML = '<main id="page-root" style="flex:1"></main>';
      Pages[this.page](document.getElementById('page-root'), this.navigate.bind(this));
      return;
    }

    appEl.innerHTML = `
      <nav class="sidebar" aria-label="Main navigation">
        <div class="brand"><div class="brand-mark"><i class="fa-solid fa-person-running"></i></div>
          <span>NDUR<span class="grad-text">ANCE</span></span></div>
        ${NAV.map(n => n.section
          ? `<div class="nav-section">${n.section}</div>`
          : `<a class="nav-item ${this.page === n.page ? 'active' : ''}" data-page="${n.page}" href="#">
               <i class="fa-solid ${n.icon}"></i><span>${n.label}</span></a>`).join('')}
        <div class="sidebar-footer">
          <a class="nav-item ${this.page === 'profile' ? 'active' : ''}" data-page="profile" href="#">
            <i class="fa-solid fa-circle-user"></i><span>${U.esc((Auth.user.full_name || Auth.user.username).split(' ')[0])}</span></a>
          <a class="nav-item" id="nav-logout" href="#"><i class="fa-solid fa-arrow-right-from-bracket"></i><span>Sign out</span></a>
        </div>
      </nav>
      <main class="main"><div id="page-root"></div></main>`;

    appEl.querySelectorAll('[data-page]').forEach(el => el.onclick = e => {
      e.preventDefault();
      this.navigate(el.dataset.page);
    });
    appEl.querySelector('#nav-logout').onclick = e => {
      e.preventDefault();
      Auth.logout();
      U.toast('Signed out', 'info');
      this.navigate('login');
    };

    const renderer = Pages[this.page] || Pages.dashboard;
    renderer(document.getElementById('page-root'), this.navigate.bind(this), this.params);
  },

  init() {
    Auth.restore();
    this.page = Auth.isAuthenticated ? 'dashboard' : 'login';
    this.render();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
