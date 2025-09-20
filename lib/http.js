// lib/http.js
// Helper HTTP che allegano il JWT di Supabase *solo in browser*.
// Import sicuro anche in SSR (nessun accesso a window a top level).

function toQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function getAccessToken() {
  if (typeof window === 'undefined') return ''; // SSR: niente token
  try {
    const mod = await import('@/lib/supabaseClient'); // lazy
    const supabase = mod?.supabase;
    if (!supabase) return '';
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  } catch {
    return '';
  }
}

async function fetchWithAuth(method, url, { body = null, query = null, timeoutMs = 30000 } = {}) {
  const token = await getAccessToken(); // '' su SSR
  const fullUrl = url + (query ? toQuery(query) : '');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(fullUrl, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : null,
      credentials: 'same-origin',
      signal: ctrl.signal,
    });

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(json?.error || json?.message || `${res.status} ${text?.slice(0,180)}`);
    return json ?? { data: text };
  } finally {
    clearTimeout(t);
  }
}

export async function getJSON(url, opts = {}) {
  return fetchWithAuth('GET', url, opts);
}
export async function postJSON(url, body, opts = {}) {
  return fetchWithAuth('POST', url, { ...opts, body });
}
export async function putJSON(url, body, opts = {}) {
  return fetchWithAuth('PUT', url, { ...opts, body });
}
export async function deleteJSON(url, body = null, opts = {}) {
  return fetchWithAuth('DELETE', url, { ...opts, body });
}
