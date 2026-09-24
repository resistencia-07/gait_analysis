/* NDURANCE — API client (RESTful Table API acts as the backend datastore) */
'use strict';

const API = {
  async list(table, params = {}) {
    const q = new URLSearchParams({ limit: 100, ...params }).toString();
    const res = await fetch(`tables/${table}?${q}`);
    if (!res.ok) throw new Error(`GET ${table} failed (${res.status})`);
    return res.json();
  },
  async get(table, id) {
    const res = await fetch(`tables/${table}/${id}`);
    if (!res.ok) throw new Error(`Record not found`);
    return res.json();
  },
  async create(table, data) {
    const res = await fetch(`tables/${table}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`POST ${table} failed (${res.status})`);
    return res.json();
  },
  async update(table, id, data) {
    const res = await fetch(`tables/${table}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`PATCH ${table} failed (${res.status})`);
    return res.json();
  },
  async remove(table, id) {
    await fetch(`tables/${table}/${id}`, { method: 'DELETE' });
  }
};

/* ---------------- Auth service (client-side JWT-style session) ---------------- */
const Auth = {
  KEY: 'ndurance.session',
  user: null,

  async register(form) {
    // uniqueness check
    const existing = await API.list('users', { limit: 1000 });
    const rows = (existing.data || []).filter(r => !r.deleted);
    if (rows.some(u => (u.username || '').toLowerCase() === form.username.toLowerCase()))
      throw new Error('Username already taken');
    if (rows.some(u => (u.email || '').toLowerCase() === form.email.toLowerCase()))
      throw new Error('Email already registered');

    const user = await API.create('users', {
      id: U.uuid(),
      username: form.username.trim(),
      full_name: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      password_hash: await U.sha256(form.password),
      age: Number(form.age) || null,
      gender: form.gender || 'other',
      height_cm: Number(form.height) || null,
      weight_kg: Number(form.weight) || null,
      role: 'athlete'
    });
    this._store(user);
    return this.user;
  },

  async login(usernameOrEmail, password) {
    const hash = await U.sha256(password);
    const res = await API.list('users', { limit: 1000 });
    const needle = usernameOrEmail.trim().toLowerCase();
    const user = (res.data || []).find(u => !u.deleted &&
      ((u.username || '').toLowerCase() === needle || (u.email || '').toLowerCase() === needle));
    if (!user || user.password_hash !== hash) throw new Error('Invalid credentials');
    this._store(user);
    return this.user;
  },

  _store(user) {
    const { password_hash, ...safe } = user;
    this.user = safe;
    const token = btoa(JSON.stringify({ sub: user.id, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
    localStorage.setItem(this.KEY, JSON.stringify({ token, user: safe }));
  },

  restore() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (!raw) return null;
      const payload = JSON.parse(atob(raw.token));
      if (payload.exp < Date.now()) { this.logout(); return null; }
      this.user = raw.user;
      return this.user;
    } catch { return null; }
  },

  async refreshProfile() {
    if (!this.user) return null;
    try {
      const fresh = await API.get('users', this.user.id);
      this._store(fresh);
    } catch { /* keep cached */ }
    return this.user;
  },

  async updateProfile(patch) {
    if (!this.user) throw new Error('Not authenticated');
    const updated = await API.update('users', this.user.id, patch);
    this._store(updated);
    return this.user;
  },

  logout() {
    this.user = null;
    localStorage.removeItem(this.KEY);
  },

  get isAuthenticated() { return !!this.user; }
};

window.API = API;
window.Auth = Auth;
