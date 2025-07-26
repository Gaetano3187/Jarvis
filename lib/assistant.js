/* helper: da testo “grezzo” → oggetto { listType, names[] } */
export async function parseAssistant(answer, fallback) {
  try {
    const arr = JSON.parse(answer);
    if (Array.isArray(arr)) return { listType: fallback, names: arr };
  } catch (_) {
    /* ignore JSON parse errors */
  }

  const names = answer
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);

  return { listType: fallback, names };
}
