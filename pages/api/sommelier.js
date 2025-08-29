// pages/api/sommelier.js
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID || '';
const SOMMELIER_SYSTEM = process.env.SOMMELIER_SYSTEM_PROMPT || `
Sei “Sommelier di Jarvis”. Rispondi SOLO in JSON.
Se è presente "wine_list" o "wine_list_candidates", proponi PRIORITARIAMENTE vini presi da quella lista (campo "from_list" nell'output). 
Interpreta indicazioni gusto:
- "non troppo aspro/poco aspro/morbido/rotondo" → acidity:low
- "molto fresco/tagliente/acido" → acidity:high
- "morbido/setoso/poco tannico" → tannin:low
- "tannico/ruvido/astringente" → tannin:high
- "beverino/leggero/snello" → body:light
- "strutturato/corposo/pieno" → body:full
- "secco" → sweetness:dry; "amabile/abboccato/dolce" → sweetness:sweet
Schema:
{
  "intent": "from_list|alternative|recommend|pairing|retailers",
  "criteria": {
    "query": string,
    "budget_eur": {"min": number|null, "max": number|null},
    "region": string|null,
    "taste": {"acidity":"low|med|high"|null,"tannin":"low|med|high"|null,"body":"light|med|full"|null,"sweetness":"dry|off-dry|sweet"|null,"tags":[string]}
  },
  "from_list_candidates":[{"name":string,"winery":string|null,"denomination":string|null,"vintage":number|null,"abv":number|null,"raw":string}],
  "recommendations":[{"name":string,"winery":string|null,"denomination":string|null,"region":string|null,"grapes":[string]|[],"vintage_suggestion":[number]|[],"style":string|null,"abv":number|null,"typical_price_eur":number|null,"why":string,"links":[{"title":string,"url":string}]}],
  "notes": string|null,
  "provider_used": "operator|serpapi|bing|none"
}
Regole:
- Con wine_list presente, intent="from_list" e non suggerire elementi non in lista salvo richiesta esplicita.
- 3–5 proposte ordinate per aderenza ai gusti/budget. JSON valido.
`;

function normTasteHints(h) {
  if (!h) return null;
  const map = (v, low='low', med='med', high='high') => {
    if (!v) return null;
    const t = String(v).toLowerCase();
    if (/(basso|poco|legger|morbido|soft|light)/.test(t)) return low;
    if (/(alto|marcato|tagliente|strong|high)/.test(t)) return high;
    return med;
  };
  return {
    acidity:  map(h.acidity),
    tannin:   map(h.tannin),
    body:     map(h.body, 'light', 'med', 'full'),
    sweetness: h.sweetness ? String(h.sweetness) : null,
    tags: Array.isArray(h.tags) ? h.tags : []
  };
}

function parseWineList(wineListText) {
  if (!wineListText) return [];
  const lines = String(wineListText).split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
  const out = [];
  for (const raw of lines) {
    const vintage = (()=>{ const m = /\b(19|20)\d{2}\b/.exec(raw); return m ? Number(m[0]) : null; })();
    const denom   = (()=>{ const m = /\b(DOCG|DOC|IGT)\b/i.exec(raw); return m ? m[1].toUpperCase() : null; })();
    const abv     = (()=>{ const m = /(alc\.?\s*)?(\d{1,2}(?:[.,]\d)?)\s*%/i.exec(raw); return m ? Number(m[2].replace(',','.')) : null; })();

    let name = null, winery = null;
    const dash = raw.split(/\s+-\s+/);
    if (dash.length === 2) {
      const [left, right] = dash;
      if (/(cantina|azienda|produttore|tenuta|vinicola)/i.test(right) || right.split(' ').length <= 3) {
        winery = right;
        name = left.replace(/\b(19|20)\d{2}\b/g,'').replace(/\b(DOCG|DOC|IGT)\b/ig,'').trim();
      } else { name = left; winery = right; }
    } else {
      const m = /^([A-Z][\w'À-ÖØ-öø-ÿ ]{2,20})\s+(.+)$/.exec(raw);
      if (m) { winery = m[1].trim(); name = m[2].replace(/\b(19|20)\d{2}\b/g,'').replace(/\b(DOCG|DOC|IGT)\b/ig,'').trim(); }
      else { name = raw; }
    }
    out.push({ name: name || raw, winery: winery || null, denomination: denom || null, vintage, abv, raw });
  }
  return out;
}

function buildProviderHint() {
  return {
    operator: !!(process.env.OPERATOR_BASE_URL && process.env.OPERATOR_API_KEY),
    serpapi:  !!process.env.SERPAPI_API_KEY,
    bing:     !!process.env.BING_SEARCH_API_KEY
  };
}

// Assistants API compat
async function runsCreateCompat(threadId, body) {
  const runs = openai.beta.threads.runs;
  return (typeof runs.create === 'function' && runs.create.length >= 2)
    ? runs.create(threadId, body)
    : runs.create({ thread_id: threadId, ...body });
}
async function runsRetrieveCompat(threadId, runId) {
  const runs = openai.beta.threads.runs;
  return (typeof runs.retrieve === 'function' && runs.retrieve.length >= 2)
    ? runs.retrieve(threadId, runId)
    : runs.retrieve({ thread_id: threadId, run_id: runId });
}
async function messagesListCompat(threadId, params = {}) {
  const msgs = openai.beta.threads.messages;
  return (typeof msgs.list === 'function' && msgs.list.length >= 2)
    ? msgs.list(threadId, params)
    : msgs.list({ thread_id: threadId, ...params });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { query, budget, region, wineList, qrLinks, tasteHints } = req.body || {};
    if (!query && !wineList) return res.status(400).json({ error: 'Missing query or wineList' });

    const provider_hint = buildProviderHint();
    const taste = normTasteHints(tasteHints);
    const candidates = parseWineList(wineList || '');

    const payload = {
      mode: 'sommelier',
      provider_hint,
      query: query || 'Consigliami il migliore in base ai miei gusti',
      wine_list: wineList || null,
      wine_list_candidates: candidates.length ? candidates : null,
      qr_links: Array.isArray(qrLinks) && qrLinks.length ? qrLinks : null,
      taste_hints: taste,
      criteria: { budget, region }
    };

    if (ASSISTANT_ID) {
      const thread = await openai.beta.threads.create({ messages: [{ role:'user', content: JSON.stringify(payload) }] });
      const run = await runsCreateCompat(thread.id, { assistant_id: ASSISTANT_ID, ...(SOMMELIER_SYSTEM ? { instructions: SOMMELIER_SYSTEM } : {}) });

      let status = run.status, tries = 0;
      while ((status === 'queued' || status === 'in_progress') && tries < 30) {
        await new Promise(r => setTimeout(r, 500));
        const r2 = await runsRetrieveCompat(thread.id, run.id);
        status = r2.status; tries++;
      }
      if (status !== 'completed') {
        return res.status(200).json({
          intent: 'from_list',
          criteria: { query, budget_eur:{min:null,max:budget??null}, region: region||null, taste },
          from_list_candidates: candidates,
          recommendations: [],
          notes: 'Assistant non ha completato in tempo.',
          provider_used: provider_hint.operator ? 'operator' : (provider_hint.serpapi ? 'serpapi' : (provider_hint.bing ? 'bing' : 'none'))
        });
      }
      const msgs = await messagesListCompat(thread.id, { order:'desc', limit:1 });
      const content = msgs.data?.[0]?.content?.[0];
      const text = (content && content.type === 'text') ? content.text?.value : '';
      try { return res.status(200).json(JSON.parse(text || '{}')); }
      catch {
        const m = /{[\s\S]*}/.exec(text || ''); 
        return res.status(200).json(m ? JSON.parse(m[0]) : { recommendations: [], notes: text||'Risposta non in JSON', provider_used:'none' });
      }
    }

    // Fallback
    const chat = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type:'json_object' },
      messages: [{ role:'system', content:SOMMELIER_SYSTEM }, { role:'user', content: JSON.stringify(payload) }],
      temperature: 0.2
    });
    const out = chat.choices?.[0]?.message?.content || '{}';
    try { return res.status(200).json(JSON.parse(out)); }
    catch { return res.status(200).json({ recommendations:[], notes:out, provider_used:'none' }); }
  } catch (e) {
    console.error('sommelier error', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
