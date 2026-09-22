const TOKEN_KEY = 'bunyat.token';
const USER_KEY = 'bunyat.user';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

export const session = {
  token: () => store.get(TOKEN_KEY),
  user: () => { try { return JSON.parse(store.get(USER_KEY) || 'null'); } catch { return null; } },
  save(token, user) { store.set(TOKEN_KEY, token); store.set(USER_KEY, JSON.stringify(user)); },
  clear() { store.del(TOKEN_KEY); store.del(USER_KEY); },
};
export const localPref = store;

export async function api(path, { method = 'GET', body } = {}) {
  const token = session.token();
  const res = await fetch('/api' + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) { session.clear(); window.location.assign('/login'); }
    const err = new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
    err.status = res.status; err.details = data.details;
    throw err;
  }
  return data;
}
