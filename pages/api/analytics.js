// /lib/analyticsClient.js
export async function sendAnalytics(payload) {
  const res = await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // Se vuoi loggare eventuali errori del backend:
  if (!res.ok) {
    let msg = `Analytics ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg += `: ${data.error}`;
    } catch (_) {}
    throw new Error(msg);
  }

  return res.json();
}
