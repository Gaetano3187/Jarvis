// lib/http.js
// Helper HTTP che allegano automaticamente il JWT di Supabase nell'header Authorization
// così le API /api/* vedono la sessione e passano le RLS policy.

import { supabase } from '@/lib/supabaseClient';

function toQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function fetchWithAuth(method, url, { body = null, query = null, timeoutMs = 30000 } = {}) {
  // prendi la sessione corrente (JWT)
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';

  // opzionale: querystring
  const fullUrl = url + (query ? toQuery(query) : '');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(fullUrl, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), // 👈 passiamo il JWT
      },
      body: body ? JSON.stringify(body) : null,
      credentials: 'same-origin',
      signal: ctrl.signal,
    });

    const text = await res.text(); // prova a decodificare sempre
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-json */ }

    if (!res.ok) {
      throw new Error(json?.error || json?.message || `${res.status} ${text?.slice(0,180)}`);
    }
    return json ?? { data: text };
  } finally {
    clearTimeout(t);
  }
}

// ===== API comode =====
export async function getJSON(url, opts = {}) {
  return fetchWithAuth('GET', url, opts);
}

export async function postJSON(url, body, opts = {}) {
  return fetchWithAuth('POST', url, { ...opts, body });
}

// opzionali (se ti servono)
export async function putJSON(url, body, opts = {}) {
  return fetchWithAuth('PUT', url, { ...opts, body });
}

export async function deleteJSON(url, body = null, opts = {}) {
  return fetchWithAuth('DELETE', url, { ...opts, body });
}
