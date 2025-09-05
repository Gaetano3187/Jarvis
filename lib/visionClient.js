// lib/visionClient.js
export async function callVision({ files, mode = "receipt", hintName = "", hintBrand = "" }) {
  const fd = new FormData();
  (files || []).forEach((f) => fd.append("images", f));
  fd.append("mode", mode);
  if (hintName)  fd.append("hintName", hintName);
  if (hintBrand) fd.append("hintBrand", hintBrand);

  const r = await fetch("/api/vision", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function toISODate(any) {
  const s = String(any || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return "";
  const d = String(m[1]).padStart(2,"0");
  const M = String(m[2]).padStart(2,"0");
  let y = String(m[3]); if (y.length === 2) y = (Number(y) >= 70 ? "19":"20")+y;
  return `${y}-${M}-${d}`;
}
