// pages/home.js
import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'

/* --- Utility --- */
function iso(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function eur(n){return(Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'})}

/* --- Normalizza categoria spesa --- */
function normCat(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // GDO e supermercati specifici → CASA
  if (/\b(orsini|coop|esselunga|conad|carrefour|lidl|aldi|eurospin|penny|pam|interspar|spar|sigma|naturasi|bennet|unes|famila|tigros|despar|iper|ipercoop|prix|dok|gigante|simply|mercatone|tuodi)\b/.test(s)) return 'casa'
  // Keywords casa
  if (/\b(supermercat|spesa|alimentar|cibo|frutta|verdura|carne|pesce|pane|latte|uova|pasta|riso|olio|acqua|bibite|bevande|detersiv|pulizia|ammorbident|candeggina|bolletta|luce|gas|internet|affitto|mutuo|condomin|manutenzione|arredo|mobile|cucina|elettrodomest|lavatrice|frigorifero|ferramenta|giardinaggio|asporto|porta.?via|take.?away|deliveroo|glovo|just.?eat)\b/.test(s)) return 'casa'
  // VESTITI
  if (/\b(vestit|abbigliam|scarpe|camicia|pantalon|maglion|giacca|cappotto|borsa|cintura|cravatta|calze|intimo|pigiama|costume|sciarpa|guanti|cappello|gioiell|orologio|zaino|valigia|moda|boutique|abbigliamento)\b/.test(s)) return 'vestiti'
  // CENE
  if (/\b(ristorante|pizzeria|trattoria|osteria|braceria|sushi|kebab|hamburgeria|bistrot|pub|birreria|enoteca|bar|caffe|caffetteria|colazione|pranzo|cena|aperitiv|spritz|cocktail|gelateria|pasticceria|paninoteca|fast.?food)\b/.test(s)) return 'cene'
  return null
}
function catFromStore(store, storeType) {
  return normCat([store, storeType].filter(Boolean).join(' '))
}

/* ─── Audio helpers ─────────────────────────────────────────────── */
function getBestMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'])
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch {}
  return ''
}
function extForMime(m = '') {
  if (m.includes('mp4')) return 'voice.mp4'
  if (m.includes('ogg')) return 'voice.ogg'
  return 'voice.webm'
}

/* ─── Esegui azione agente ──────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════
   QUERY DATI LOCALI — risponde a domande analitiche senza GPT
══════════════════════════════════════════════════════════════════ */
async function queryData(text, userId) {
  if (!userId) return null
  const s = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')

  // ── Riconosci periodo ──
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  let dateFrom = null, dateTo = null, periodoLabel = ''

  if (/\b(oggi|giornata di oggi)\b/.test(s)) {
    dateFrom = dateTo = iso(now); periodoLabel = 'oggi'
  } else if (/\b(ieri)\b/.test(s)) {
    const ieri = new Date(y,m,d-1); dateFrom = dateTo = iso(ieri); periodoLabel = 'ieri'
  } else if (/\b(questa\s+settimana|settimana\s+(corrente|in corso))\b/.test(s)) {
    const lunedi = new Date(y,m,d - ((now.getDay()||7)-1))
    dateFrom = iso(lunedi); dateTo = iso(now); periodoLabel = 'questa settimana'
  } else if (/\b(settimana\s+scorsa)\b/.test(s)) {
    const lun = new Date(y,m,d - ((now.getDay()||7)-1) - 7)
    const dom = new Date(lun); dom.setDate(dom.getDate()+6)
    dateFrom = iso(lun); dateTo = iso(dom); periodoLabel = 'settimana scorsa'
  } else if (/\b(questo\s+mese|mese\s+(corrente|in corso))\b/.test(s) || /\bmese\b/.test(s)) {
    dateFrom = iso(new Date(y,m,1)); dateTo = iso(now); periodoLabel = 'questo mese'
  } else if (/\b(mese\s+scorso|scorso\s+mese)\b/.test(s)) {
    dateFrom = iso(new Date(y,m-1,1)); dateTo = iso(new Date(y,m,0)); periodoLabel = 'mese scorso'
  } else if (/\b(quest[o']?\s+anno|anno\s+(corrente|in corso))\b/.test(s) || /\banno\b/.test(s)) {
    dateFrom = `${y}-01-01`; dateTo = iso(now); periodoLabel = `nel ${y}`
  } else if (/\b(anno\s+scorso|scorso\s+anno)\b/.test(s)) {
    dateFrom = `${y-1}-01-01`; dateTo = `${y-1}-12-31`; periodoLabel = `nel ${y-1}`
  }

  // ── Tipo domanda ──
  const isSpesa = /\b(speso|spesa|costi|quanto|spese|acquistato|comprato|pagato)\b/.test(s)
  const isCosa  = /\b(cosa|quali?|elenco|lista|mostra|dimmi|ho comprato|ho acquistato)\b/.test(s)
  const isVino  = /\b(vino|vini|bottigl|cantina|cellar|etichett)\b/.test(s)
  const isDispensa = /\b(dispensa|scorte|inventario|scadenz|cosa ho in casa|frigo)\b/.test(s)
  const isSommelier = /\b(consiglia|abbina|sommelier|cosa bevo|quale vino|vino per|abbinamento)\b/.test(s)

  if (!dateFrom && !isVino && !isDispensa && !isSommelier) return null

  try {
    // ── BUDGET / DISPONIBILITÀ ──
    if (/\b(budget|disponib|quanto\s+mi\s+rest|bast|finit|stai\s+per|esaurit|entrate\s+del\s+mese)\b/.test(s)) {
      const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'budget_status', userId }) })
      const d = await r.json()
      return d.text || null
    }

    // ── CONFRONTO MESI ──
    if (/\b(rispetto\s+al\s+mese\s+scorso|confronto|di\s+più\s+questo\s+mese|di\s+meno|mese\s+scorso\s+vs|trend\s+spese)\b/.test(s)) {
      const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'compare_months', userId }) })
      const d = await r.json()
      return d.text || null
    }

    // ── RICETTE ──
    if (/\b(ricett|cucinare|cosa\s+(posso\s+)?fare\s+(da\s+mangiar|con\s+quello|con\s+quel)|cuoco|pranzo\s+con|cena\s+con)\b/.test(s)) {
      const pref = s.match(/\b(veloce|facile|vegetariano|senza\s+carne|pasta|risotto|zuppa|insalata)\b/)?.[0] || ''
      const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'recipes', userId, payload:{ preference: pref } }) })
      const d = await r.json()
      return d.text || null
    }

    // ── STORICO PREZZI ──
    if (/\b(cost[ao]\s+(il|la|il)?|prezzo\s+(del|della|di)|quanto\s+ho\s+pagato\s+(il|la)|storico\s+prezz)\b/.test(s)) {
      // Estrai nome prodotto
      const m = text.match(/(?:costava?|pagato|prezzo\s+(?:del|della|di))\s+(?:il|la|lo|gli|le|l')?\s*([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]{2,30})/i)
      const product = m?.[1]?.trim() || text.replace(/quanto|costava?|il|la|lo|prezzo|del|della|di|mesi\s+fa/gi,'').trim()
      if (product.length > 2) {
        const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'price_history', userId, payload:{ product } }) })
        const d = await r.json()
        return d.text || null
      }
    }

    // ── REPORT ──
    if (/\b(report|resoconto|riepilogo|sommario|bilancio\s+(mensile|settimanale|annuale))\b/.test(s)) {
      const period = /\b(settiman)\b/.test(s)?'week': /\b(anno|annuale)\b/.test(s)?'year':'month'
      const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'report', userId, payload:{ period } }) })
      const d = await r.json()
      return d.text || null
    }

    // ── VINI ──
    if (isVino && !isSommelier) {
      const { data: wineData } = await supabase.from('wines')
        .select('name,winery,style,region,vintage,rating_5').eq('user_id', userId)
        .order('created_at', {ascending:false}).limit(20)
      if (!wineData?.length) return '🍷 Non hai ancora vini registrati.'
      const list = wineData.slice(0,8).map(w =>
        `• ${w.name}${w.vintage?' '+w.vintage:''}${w.winery?' — '+w.winery:''}${w.rating_5?' ('+w.rating_5+'★)':''}`
      ).join('\n')
      return `🍷 Hai ${wineData.length} vini registrati:\n${list}${wineData.length>8?'\n…e altri '+( wineData.length-8):''}`
    }

    // ── DISPENSA ──
    if (isDispensa && !dateFrom) {
      const { data: inv } = await supabase.from('inventory')
        .select('product_name,qty,unit_label,expiry_date,consumed_pct').eq('user_id', userId)
        .order('product_name', {ascending:true})
      if (!inv?.length) return '📦 La dispensa è vuota.'
      const inScadenza = inv.filter(i => i.expiry_date && new Date(i.expiry_date) <= new Date(Date.now()+7*86400000))
      const list = inv.slice(0,8).map(i =>
        `• ${i.product_name}: ${i.qty} ${i.unit_label||'pz'}${i.expiry_date?' (scade '+i.expiry_date+')':''}`
      ).join('\n')
      let reply = `📦 In dispensa hai ${inv.length} prodotti:\n${list}${inv.length>8?'\n…e altri '+(inv.length-8):''}`
      if (inScadenza.length) reply += `\n\n⚠️ In scadenza entro 7 giorni: ${inScadenza.map(i=>i.product_name).join(', ')}`
      return reply
    }

    if (!dateFrom) return null

    // ── QUANTO HO SPESO ──
    if (isSpesa && !isCosa) {
      // Rileva categoria
      let catFilter = null
      if (/\b(supermercat|supermercato|alimentar|casa)\b/.test(s)) catFilter = 'casa'
      else if (/\b(cena|cene|ristorante|bar|aperitiv)\b/.test(s)) catFilter = 'cene'
      else if (/\b(vestit|abbigliament|scarpe|moda)\b/.test(s)) catFilter = 'vestiti'
      else if (/\b(varie|farmacia|benzina|parrucchiere)\b/.test(s)) catFilter = 'varie'

      let q = supabase.from('expenses').select('amount,category,store').eq('user_id', userId)
        .gte('purchase_date', dateFrom).lte('purchase_date', dateTo)
      if (catFilter) q = q.eq('category', catFilter)
      const { data: exps } = await q

      if (!exps?.length) return `💸 Nessuna spesa registrata ${periodoLabel}${catFilter?' in categoria '+catFilter:''}.`
      const tot = exps.reduce((t,e) => t+Number(e.amount||0), 0)

      if (catFilter) return `💸 Hai speso ${eur(tot)} in "${catFilter}" ${periodoLabel} (${exps.length} acquisti).`

      // Breakdown per categoria
      const byCat = {}
      exps.forEach(e => { byCat[e.category] = (byCat[e.category]||0) + Number(e.amount||0) })
      const catIcons = {casa:'🏠',cene:'🍽️',vestiti:'👗',varie:'🧰'}
      const breakdown = Object.entries(byCat).sort((a,b)=>b[1]-a[1])
        .map(([c,v]) => `  ${catIcons[c]||'📦'} ${c}: ${eur(v)}`).join('\n')
      return `💸 Hai speso ${eur(tot)} ${periodoLabel}:\n${breakdown}`
    }

    // ── COSA HO COMPRATO ──
    if (isCosa) {
      let q = supabase.from('expenses').select('store,amount,purchase_date,category,description')
        .eq('user_id', userId).gte('purchase_date', dateFrom).lte('purchase_date', dateTo)
        .order('purchase_date', {ascending:false}).limit(15)
      const { data: exps } = await q
      if (!exps?.length) return `🛒 Nessun acquisto registrato ${periodoLabel}.`
      const tot = exps.reduce((t,e) => t+Number(e.amount||0), 0)
      const catIcons = {casa:'🏠',cene:'🍽️',vestiti:'👗',varie:'🧰'}
      const list = exps.map(e =>
        `${catIcons[e.category]||'📦'} ${e.store||e.description||'Acquisto'} — ${eur(e.amount)} (${e.purchase_date})`
      ).join('\n')
      return `🛒 ${exps.length} acquisti ${periodoLabel} — totale ${eur(tot)}:\n${list}`
    }

  } catch(e) { console.error('[queryData]', e) }
  return null
}

async function executeAction(action, userId, router) {
  if (!action || !userId) return null
  try {
    const today = new Date().toISOString().slice(0, 10)
    switch (action.type) {
      case 'add_expense': {
        // normCat può restituire null se non riconosce il negozio
        // catFromStore cerca per nome/tipo, con fallback garantito a 'varie'
        const rawCat = catFromStore(action.category, action.store_type)
          || (['casa','vestiti','cene','varie'].includes(action.category) ? action.category : null)
          || 'varie'
        const { error } = await supabase.from('expenses').insert({
          user_id: userId, category: rawCat,
          store: action.store || null,
          description: action.description || action.store || 'Spesa vocale',
          amount: Number(action.amount || 0), purchase_date: action.date || today,
          payment_method: action.payment_method || 'cash', source: 'voice',
        })
        if (error) throw error
        if ((action.payment_method || 'cash') === 'cash' && action.amount > 0)
          await supabase.from('pocket_cash').insert({
            user_id: userId, note: action.description || 'Spesa vocale',
            delta: -Number(action.amount), moved_at: new Date().toISOString(),
          })
        return `✓ Spesa €${Number(action.amount).toFixed(2)} salvata`
      }
      case 'add_income': {
        const { error } = await supabase.from('incomes').insert({
          user_id: userId, source: action.source || 'Entrata',
          description: action.description || 'Entrata vocale',
          amount: Number(action.amount || 0),
          received_date: action.date || today,
        })
        if (error) throw error
        return `✓ Entrata €${Number(action.amount).toFixed(2)} salvata`
      }
      case 'add_to_list': {
        // Guard: name può arrivare come action.name, action.item, action.product o action.product_name
        const itemName = (action.name || action.item || action.product || action.product_name || '').trim()
        if (!itemName) return '⚠️ Non ho capito il prodotto da aggiungere, riprova'
        const { error } = await supabase.from('shopping_list').insert({
          user_id: userId,
          name: itemName,
          qty: Number(action.qty || action.quantity || 1),
          unit_label: action.unit || action.unit_label || 'pz',
          list_type: action.list_type || 'supermercato',
          category: action.category || 'alimentari',
        })
        if (error) throw error
        return `✓ "${itemName}" aggiunto alla lista della spesa`
      }
      case 'add_wine': {
        const { error } = await supabase.from('wines').insert({
          user_id: userId, name: action.name, winery: action.winery || null,
          region: action.region || null, vintage: action.vintage || null,
          style: action.style || 'rosso', source: 'voice',
        })
        if (error) throw error
        return `✓ Vino "${action.name}" aggiunto`
      }
      case 'navigate':
        if (action.path) router.push(action.path)
        return null
      default: return null
    }
  } catch (e) { return '⚠️ ' + (e.message || e) }
}

/* ═══════════════════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════════════════ */
const Home = () => {
  const router = useRouter()
    /* ── State ── */
  const [userId,      setUserId]      = useState(null)
  const [pocketBal,   setPocketBal]   = useState(null)
  const [alertItems,  setAlertItems]  = useState([])
  const [listaSpesa,  setListaSpesa]  = useState([])
  const [showLista,   setShowLista]   = useState(false)
  const [loadingOCR,  setLoadOCR]     = useState(false)
  const [ocrResult,   setOcrResult]   = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState(null)

  /* Jarvis chat */
  const mediaRef    = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)
  const [isRec,     setIsRec]     = useState(false)
  const [aibusy,    setAiBusy]    = useState(false)
  const [jarvisOpen, setJarvisOpen] = useState(false)
  const [messages,  setMessages]  = useState([
    { role: 'assistant', text: 'Ciao! Sono Jarvis. Puoi chiedermi:\n💸 "Quanto mi resta questo mese?" · "Ho speso di più a marzo o aprile?"\n🍳 "Cosa posso cucinare con quello che ho?"\n📊 "Report mensile" · "Quanto costava il latte?"\n🍷 "Consiglimi un vino rosso per la bistecca"\n🧾 Usa il tasto Bolletta per scansionare fatture gas/luce\n🔔 Tasto Alert per notifiche push' }
  ])
  const [textInput, setTextInput] = useState('')
  const messagesEndRef = useRef(null)

  /* ── Push notifications & wine feedback ── */
  const [pushEnabled,   setPushEnabled]   = useState(false)
  const [pendingVote,   setPendingVote]   = useState(null) // { feedbackId, wineName }
  const [showVoteModal, setShowVoteModal] = useState(false)
  const [wineVote,      setWineVote]      = useState({ ratingWine: 0, ratingAdvice: 0, notes: '' })

  /* ── OCR bolletta ── */
  const billOcrRef = useRef(null)
  const [billBusy, setBillBusy] = useState(false)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])


  async function checkPendingNotifications(uid) {
    try {
      const r = await fetch('/api/push-notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', userId: uid })
      })
      const { pending } = await r.json()
      if (!pending?.length) return
      for (const notif of pending) {
        if (notif.type === 'wine_vote' && notif.payload?.feedback_id) {
          setPendingVote({ feedbackId: notif.payload.feedback_id, wineName: notif.payload.wine_name })
          setShowVoteModal(true)
          setJarvisOpen(true)
          setMessages(p => [...p, {
            role: 'assistant',
            text: `⏰ È passata mezz'ora — com'era ${notif.payload.wine_name}? Votalo! 🍷`
          }])
          break
        }
        if (notif.type === 'budget_alert') {
          setMessages(p => [...p, { role: 'assistant', text: notif.payload.message || '⚠️ Alert budget!' }])
          setJarvisOpen(true)
        }
        if (notif.type === 'expiry_alert') {
          setMessages(p => [...p, { role: 'assistant', text: `📦 Attenzione: ${notif.payload.products?.join(', ')} stanno per scadere!` }])
          setJarvisOpen(true)
        }
      }
    } catch(e) { console.warn('[poll notif]', e) }
  }

  async function enablePushNotifications(uid) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setMessages(p => [...p, { role:'assistant', text:'⚠️ Il tuo browser non supporta le notifiche push.' }])
      return
    }
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setMessages(p => [...p, { role:'assistant', text:'❌ Permesso notifiche negato. Abilitalo dalle impostazioni del browser.' }])
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) { setPushEnabled(true); return } // senza VAPID solo polling
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey })
      await fetch('/api/push-notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', userId: uid, subscription: sub.toJSON() })
      })
      setPushEnabled(true)
      setMessages(p => [...p, { role:'assistant', text:'🔔 Notifiche push attivate! Riceverai alert per scadenze, budget e vini.' }])
    } catch(e) { console.error('[push]', e) }
  }

  async function handleBillOcr(file) {
    if (!file || !userId) return
    setBillBusy(true)
    setMessages(p => [...p, { role:'assistant', text:'🧾 Analizzo la bolletta… (15-20 secondi)' }])
    setJarvisOpen(true)
    try {
      const fd = new FormData(); fd.append('image', file, file.name || 'bolletta.jpg')
      const r = await fetch('/api/ocr-bill', { method:'POST', body: fd })
      const data = await r.json()
      if (!r.ok || !data.ok) throw new Error(data.error || 'OCR fallito')
      // Salva automaticamente
      const r2 = await fetch('/api/jarvis-query', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'save_bill', userId, payload:{ billData: data } })
      })
      const saved = await r2.json()
      setMessages(p => [...p.slice(0,-1), { role:'assistant', text: saved.text || '✅ Bolletta salvata!' }])
      if (userId) loadData(userId)
    } catch(e) {
      setMessages(p => [...p.slice(0,-1), { role:'assistant', text:'⚠️ OCR bolletta: ' + e.message }])
    } finally { setBillBusy(false) }
  }

  async function submitWineVote() {
    if (!pendingVote || !userId) return
    try {
      const r = await fetch('/api/wine-pairing-flow', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'submit_feedback', userId,
          feedbackId: pendingVote.feedbackId,
          ratingWine:   wineVote.ratingWine,
          ratingAdvice: wineVote.ratingAdvice,
          notes:        wineVote.notes,
        })
      })
      const d = await r.json()
      setMessages(p => [...p, { role:'assistant', text: d.text || '✅ Voto salvato!' }])
      setShowVoteModal(false); setPendingVote(null); setWineVote({ ratingWine:0, ratingAdvice:0, notes:'' })
    } catch(e) { setMessages(p => [...p, { role:'assistant', text:'⚠️ ' + e.message }]) }
  }


  /* ── Auth + dati ── */
  useEffect(() => {
    let poll = null
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      loadData(user.id)
      // Polling notifiche ogni 5 minuti
      poll = setInterval(() => checkPendingNotifications(user.id), 5 * 60 * 1000)
      // Primo check dopo 35 minuti
      setTimeout(() => checkPendingNotifications(user.id), 35 * 60 * 1000)
    })
    return () => {
      if (poll) clearInterval(poll)
      try { if (mediaRef.current?.state === 'recording') mediaRef.current.stop() } catch {}
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
    }
  }, [])

  async function loadData(uid) {
    const today = new Date(); const in10 = new Date(); in10.setDate(today.getDate() + 10)
    const [{ data: inv }, { data: lista }, { data: pocket }] = await Promise.all([
      supabase.from('inventory').select('id,product_name,qty,initial_qty,consumed_pct,expiry_date').eq('user_id', uid),
      supabase.from('shopping_list').select('id,name,qty,unit_label,list_type,store,price').eq('user_id', uid).eq('purchased', false).order('added_at', { ascending: true }),
      supabase.from('pocket_cash').select('delta').eq('user_id', uid),
    ])
    setPocketBal((pocket || []).reduce((t, r) => t + Number(r.delta || 0), 0))
    const scorteAlert = (inv || []).filter(item => {
      const pct = item.consumed_pct ?? (item.initial_qty > 0 ? ((item.initial_qty - item.qty) / item.initial_qty) * 100 : 0)
      const exp = item.expiry_date ? new Date(item.expiry_date) : null
      return pct >= 80 || (exp && exp <= in10)
    }).map(item => {
      const pct = item.consumed_pct ?? 0
      const exp = item.expiry_date ? new Date(item.expiry_date) : null
      const gg  = exp ? Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)) : null
      return { id: 'inv-' + item.id, name: item.product_name ?? 'Prodotto', tag: gg !== null && gg <= 10 ? `scade in ${gg}g` : `consumato ${Math.round(pct)}%`, type: 'scorta' }
    })
    const daComprare = (lista || []).map(p => ({ id: 'shop-' + p.id, name: p.name, tag: 'da comprare', type: 'lista' }))
    setAlertItems([...scorteAlert, ...daComprare])
    setListaSpesa(lista || [])
  }


  /* ── Jarvis chat ── */
  const historyRef = useRef([])
  useEffect(() => { historyRef.current = messages.slice(-6).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })) }, [messages])

  const send = useCallback(async (text) => {
    if (!text.trim() || !userId) return
    setAiBusy(true)
    setMessages(p => [...p, { role: 'user', text }])
    try {
      const s = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')

      // ── 1. Query analitiche locali — risponde istantaneamente dal DB ──
      const localReply = await queryData(text, userId)
      if (localReply) {
        setMessages(p => [...p, { role: 'assistant', text: localReply }])
        return  // finally fa setAiBusy(false)
      }

      // ── 2. Sommelier integrato ──
      if (/\b(consiglia|abbina|sommelier|cosa bevo|quale vino|vino per|abbinamento vino|suggerisci un vino)\b/.test(s)) {
        setMessages(p => [...p, { role: 'assistant', text: '🍷 Consulto il sommelier…' }])
        const { data: winePrefs } = await supabase.from('wines')
          .select('name,style,region,denomination,rating_5').eq('user_id', userId)
          .gte('rating_5', 4).limit(10)
        const prefsText = winePrefs?.length
          ? 'Vini che mi piacciono (voto ≥4): ' + winePrefs.map(w=>`${w.name} (${w.style||'rosso'}, ${w.region||'—'}, ★${w.rating_5})`).join('; ')
          : ''
        const sr = await fetch('/api/sommelier', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text + (prefsText ? '\n\nI miei gusti: '+prefsText : ''), wineLists: [], qrLinks: [], userId })
        })
        const sData = await sr.json()
        const recs = sData?.recommendations || []
        if (!recs.length) {
          setMessages(p => [...p.slice(0,-1), { role: 'assistant', text: '🍷 Nessun risultato. Prova: "vino rosso corposo per bistecca sotto 20€".' }])
          return
        }
        const recText = recs.slice(0,4).map((r,i) =>
          `${i+1}. **${r.name}**${r.denomination?' — '+r.denomination:''}\n   ${r.why||''}${r.typical_price_eur?' · ~€'+r.typical_price_eur:''}`
        ).join('\n\n')
        window.__jarvisWineRecs = recs
        window.__jarvisWineQuery = text
        setMessages(p => [...p.slice(0,-1), { role: 'assistant', text: `🍷 Ecco i miei consigli:\n\n${recText}\n\n💡 Scrivi "prendo il 1" (o 2, 3, 4) per aggiungerlo ai tuoi vini!` }])
        return
      }

      // ── 2b. Flusso "prendo il vino N" ──
      if (/\b(prendo|scelgo|lo\s+prendo|prender[oò]|ordino)\b/.test(s) && window.__jarvisWineRecs?.length) {
        const numMatch = text.match(/\b([1-4])\b/)
        const rec = window.__jarvisWineRecs[numMatch ? Number(numMatch[1])-1 : 0]
        if (rec) {
          setMessages(p => [...p, { role:'assistant', text:`✅ ${rec.name} — acquisisco posizione…` }])
          let lat = null, lng = null
          try {
            const pos = await new Promise((ok,ko) => navigator.geolocation.getCurrentPosition(ok, ko, { timeout:8000, enableHighAccuracy:true }))
            lat = pos.coords.latitude; lng = pos.coords.longitude
          } catch { /* GPS non disponibile, procedo senza */ }
          const wr = await fetch('/api/wine-pairing-flow', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action:'confirm_take', userId, wineRec: rec, lat, lng, sommelierQuery: window.__jarvisWineQuery })
          })
          const wd = await wr.json()
          setMessages(p => [...p.slice(0,-1), { role:'assistant', text: wd.text || '✅ Vino aggiunto!' }])
          window.__jarvisWineRecs = null
          return
        }
      }

      // ── 2c. Attiva notifiche push ──
      if (/\b(attiva|abilita|voglio)\s+.*(notifich|push|avvisi)\b/.test(s)) {
        await enablePushNotifications(userId)
        return
      }

      // ── 2d. OCR bolletta (suggerimento) ──
      if (/\b(bolletta|fattura|luce|gas|acqua|internet)\b/.test(s) && /\b(carica|scansiona|ocr|aggiungi|inserisci)\b/.test(s)) {
        setMessages(p => [...p, { role:'assistant', text:'📷 Usa il tasto 🧾 Bolletta nella barra in alto per scansionare!' }])
        return
      }

      // ── 3. Assistant-v2 per tutto il resto (spese vocali, navigazione…) ──
      const r = await fetch('/api/assistant-v2', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, userId, conversationHistory: historyRef.current }),
      })
      const data = await r.json()
      let reply = data.text || 'Non ho capito, puoi ripetere?'
      if (data.action) { const res = await executeAction(data.action, userId, router); if (res) reply += '\n' + res }
      if (data.navigate) { setTimeout(() => router.push(data.navigate), 800); reply += '\n→ Navigo…' }
      setMessages(p => [...p, { role: 'assistant', text: reply }])
    } catch(e) {
      console.error('[send]', e)
      setMessages(p => [...p, { role: 'assistant', text: '⚠️ ' + (e?.message || 'Errore di connessione.') }])
    } finally {
      setAiBusy(false)  // SEMPRE qui — non nei branch intermedi
    }
  }, [userId, router])

  const isRecRef = useRef(false)
  const toggleRec = useCallback(async () => {
    // Usa ref per evitare stale closure
    if (isRecRef.current) {
      isRecRef.current = false
      setIsRec(false)
      try { if (mediaRef.current?.state === 'recording') { mediaRef.current.requestData?.(); mediaRef.current.stop() } } catch {}
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream; chunksRef.current = []
      const mime = getBestMimeType()
      mediaRef.current = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      mediaRef.current.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data) }
      mediaRef.current.onstop = async () => {
        // onstop NON gestisce setAiBusy — lo fa send() internamente con il suo try/finally
        try {
          const t0 = Date.now()
          while (!chunksRef.current.length && Date.now() - t0 < 1500) await new Promise(r => setTimeout(r, 60))
          if (!chunksRef.current.length) { setMessages(p => [...p, { role:'assistant', text:'⚠️ Nessun audio registrato' }]); return }
          const am = mediaRef.current?.mimeType || mime || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type: am })
          if (blob.size < 500) { setMessages(p => [...p, { role:'assistant', text:'⚠️ Audio troppo corto, riprova' }]); return }
          const fd = new FormData(); fd.append('audio', blob, extForMime(am))
          const r = await fetch('/api/stt', { method: 'POST', body: fd })
          const j = await r.json().catch(() => ({}))
          if (!r.ok || !j?.text) { setMessages(p => [...p, { role:'assistant', text:'⚠️ Trascrizione fallita — riprova' }]); return }
          // send() gestisce setAiBusy(true/false) autonomamente
          await send(String(j.text || '').trim())
        } catch (e) {
          setMessages(p => [...p, { role: 'assistant', text: '⚠️ ' + (e.message || 'Errore audio') }])
        } finally {
          try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
          streamRef.current = null
        }
      }
      isRecRef.current = true
      mediaRef.current.start(250); setIsRec(true); setJarvisOpen(true)
    } catch (err) {
      isRecRef.current = false; setIsRec(false)
      setMessages(p => [...p, { role: 'assistant', text: '⚠️ ' + (err?.name === 'NotAllowedError' ? 'Microfono non autorizzato' : 'Microfono non disponibile') }])
    }
  }, [send])

  useEffect(() => { if (!isRec) return; return () => { try { if (mediaRef.current?.state === 'recording') mediaRef.current.stop() } catch {} } }, [isRec])

  const onSubmit = e => { e.preventDefault(); if (!textInput.trim() || aibusy) return; const t = textInput.trim(); setTextInput(''); send(t) }

  /* ── OCR ── */
  function resizeImage(file, maxPx = 1500, q = .88) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const s = Math.min(1, maxPx / Math.max(img.width, img.height))
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', q)
      }
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')) }
      img.src = url
    })
  }

  async function handleOCR(file) {
    if (!file) return
    setLoadOCR(true); setErr(null); setOcrResult(null)
    setJarvisOpen(true)
    setMessages(p => [...p, { role: 'assistant', text: '📷 Analizzo lo scontrino… (10-20 secondi)' }])
    try {
      const isPdf = file.type === 'application/pdf' || file.name?.endsWith('.pdf')
      const pl = isPdf ? file : await resizeImage(file)

      const fd1 = new FormData(); fd1.append('image', pl, file.name || 'foto.jpg')
      const ctrl1 = new AbortController(); const t1 = setTimeout(() => ctrl1.abort(), 65000)
      let r1; try { r1 = await fetch('/api/ocr-universal', { method: 'POST', body: fd1, signal: ctrl1.signal }) } finally { clearTimeout(t1) }
      if (!r1.ok) { const e = await r1.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r1.status}`) }
      const universal = await r1.json()

      // Etichetta vino → mostra preview per conferma
      if (universal.doc_type === 'wine_label') {
        if (universal.confidence === 'low') setErr('⚠️ Immagine poco nitida — controlla i dati')
        setOcrResult(universal)
        return
      }

      // Scontrino/fattura → salva direttamente con i dati di ocr-universal
      if (universal.doc_type === 'receipt' || universal.doc_type === 'invoice') {
        console.log('[OCR] universal data:', JSON.stringify({ store: universal.store, price_total: universal.price_total, categoria: universal.categoria, items_count: universal.items?.length, confidence: universal.confidence }))
        if (!universal.store && !universal.price_total) {
          throw new Error('OCR non ha estratto dati — riprova con foto più nitida e in buona luce')
        }
        if (universal.confidence === 'low') setErr('⚠️ Immagine poco nitida — controlla i dati')
        await _salvaRicevuta(universal)
        return
      }

      throw new Error('Documento non riconoscibile — riprova con una foto più nitida')

    } catch (e) { setErr(e.name === 'AbortError' ? '⏱ Timeout — riprova' : 'OCR: ' + e.message) }
    finally { setLoadOCR(false) }
  }

  // Salva scontrino/fattura automaticamente dopo OCR
  async function _salvaRicevuta(data) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const pd  = data.purchase_date ?? new Date().toISOString().slice(0, 10)
      const st  = data.store ?? 'Generico'
      const im  = parseFloat(data.price_total ?? 0)
      // 1. Il nome/tipo negozio ha sempre priorità (corregge errori di GPT)
      // 2. Se non basta, usa la categoria di ocr-universal
      const cat = catFromStore(data.store, data.store_type)
        || (['casa','vestiti','cene','varie'].includes(data.categoria) ? data.categoria : 'varie')
      const pm  = data.payment_method ?? 'unknown'
      const items = Array.isArray(data.items) ? data.items : []

      // Salva spesa
      const { data: expRow, error: expErr } = await supabase.from('expenses').insert([{
        user_id: user.id, category: cat, store: st,
        store_address: data.store_address ?? null,
        description: `Spesa ${st} — ${pd}`,
        purchase_date: pd, amount: im, payment_method: pm, source: 'ocr',
      }]).select('id').single()
      if (expErr) throw new Error(expErr.message)

      // Salva receipt
      let recId = null
      try {
        const { data: rr } = await supabase.from('receipts').insert([{
          user_id: user.id, expense_id: expRow?.id, store: st,
          store_address: data.store_address ?? null,
          purchase_date: pd, price_total: im, payment_method: pm,
          raw_text: data.raw_text ?? null, confidence: data.confidence ?? 'medium',
        }]).select('id').single()
        recId = rr?.id ?? null
      } catch {}

      // Salva receipt_items
      if (recId && items.length) {
        try {
          await supabase.from('receipt_items').insert(items.map(it => ({
            receipt_id: recId, user_id: user.id, name: it.name,
            brand: it.brand ?? null,
            packs: it.packs ?? 1,
            units_per_pack: it.units_per_pack ?? 1,
            unit_per_pack_label: it.unit_per_pack_label ?? 'pz',
            qty: it.qty ?? 1, unit: it.unit ?? 'pz',
            unit_price: it.unit_price ?? it.price ?? 0, price: it.price ?? 0,
            category_item: it.category_item ?? 'alimentari',
            expiry_date: it.expiry_date ?? null, purchase_date: pd,
          })))
        } catch {}
      }

      // Aggiorna inventario (solo categoria casa)
      if (cat === 'casa' && items.length) {
        for (const item of items.filter(it => it.name && it.category_item !== 'altro')) {
          try {
            const tot = Number(item.qty || 1)
            const perishable = item.perishable_type || 'standard'
            const catItem = item.category_item || 'alimentari'
            const expiryAuto = perishable === 'fresh' && !item.expiry_date
              ? (() => { const d = new Date(pd); d.setDate(d.getDate()+2); return d.toISOString().slice(0,10) })()
              : (item.expiry_date ?? null)
            const searchKey = item.name.split(' ').slice(0,2).join(' ')
            const { data: ex } = await supabase.from('inventory').select('id,qty,initial_qty')
              .eq('user_id', user.id).ilike('product_name', `%${searchKey}%`).maybeSingle()
            if (ex) {
              await supabase.from('inventory').update({
                qty: Number(ex.qty || 0) + tot,
                initial_qty: Number(ex.initial_qty || 0) + tot,
                consumed_pct: 0, avg_price: item.unit_price || item.price || 0,
                last_updated: new Date().toISOString(), perishable_type: perishable,
                ...(expiryAuto ? { expiry_date: expiryAuto } : {}),
              }).eq('id', ex.id)
            } else {
              await supabase.from('inventory').insert({
                user_id: user.id, product_name: item.name, brand: item.brand ?? null,
                category: catItem,
                qty: tot, initial_qty: tot,
                packs: item.packs ?? 1,
                units_per_pack: item.units_per_pack ?? 1,
                unit_label: item.unit_per_pack_label ?? item.unit ?? 'pz',
                unit: item.unit ?? 'pz',
                avg_price: item.unit_price || item.price || 0,
                purchase_date: pd, expiry_date: expiryAuto, consumed_pct: 0, perishable_type: perishable,
              })
            }
          } catch (invErr) { console.warn('[inv] skip', item.name, invErr?.message) }
        }
      }

      // Spunta lista spesa
      if (items.length) {
        try {
          const { data: lista } = await supabase.from('shopping_list').select('id,name')
            .eq('user_id', user.id).eq('purchased', false)
          if (lista?.length) {
            const ids = []
            for (const item of items) {
              if (!item.name) continue
              const parola = item.name.split(' ')[0].toLowerCase()
              const match = lista.find(l =>
                l.name.toLowerCase().includes(parola) ||
                parola.includes(l.name.toLowerCase().split(' ')[0])
              )
              if (match && !ids.includes(match.id)) ids.push(match.id)
            }
            if (ids.length) await supabase.from('shopping_list')
              .update({ purchased: true, updated_at: new Date().toISOString() }).in('id', ids)
          }
        } catch {}
      }

      // Pocket cash
      if (pm === 'cash' && im > 0) {
        try {
          await supabase.from('pocket_cash').insert({
            user_id: user.id, note: `Spesa ${st} (${pd})`,
            delta: -im, moved_at: new Date().toISOString(),
          })
        } catch {}
      }

      const nItems = items.length
      const catIcon = {casa:'🏠',cene:'🍽️',vestiti:'👗',varie:'🧰'}[cat] || '📦'
      const catLabel = {casa:'Casa/Dispensa',cene:'Cene & Aperitivi',vestiti:'Vestiti & Moda',varie:'Spese Varie'}[cat] || cat
      setMessages(p => [...p, { role: 'assistant', text: `✅ Scontrino salvato!\n🏪 ${st} — ${eur(im)}\n${catIcon} Categoria: ${catLabel}\n📦 ${nItems} prodotti registrati${cat === 'casa' && nItems ? ' in dispensa' : ''}` }])
      setJarvisOpen(true)
      if (userId) await loadData(userId)

    } catch (e) {
      setErr('Salvataggio: ' + e.message)
    }
  }


  async function salvaRisultato() {
    if (!ocrResult || saving) return; setSaving(true); setErr(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      const docType = ocrResult.doc_type || 'receipt'

      // ── ETICHETTA VINO ──
      if (docType === 'wine_label') {
        const { data: newWine, error: wErr } = await supabase.from('wines').insert([{
          user_id: user.id,
          name: ocrResult.name || 'Vino (da etichetta)',
          winery: ocrResult.winery || null,
          denomination: ocrResult.denomination || null,
          region: ocrResult.region || null,
          vintage: ocrResult.vintage || null,
          alcohol: ocrResult.alcohol || null,
          style: ocrResult.style || 'rosso',
          grapes: ocrResult.grapes?.length ? ocrResult.grapes : null,
          source: 'ocr',
        }]).select().single()
        if (wErr) throw new Error(wErr.message)
        // Geocodifica origine
        try {
          const geoQ = [ocrResult.locality, ocrResult.winery, ocrResult.region].filter(Boolean).join(' ')
          if (geoQ.trim()) {
            const geoR = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geoQ)}&limit=1`)
            const geoJ = await geoR.json()
            if (Array.isArray(geoJ) && geoJ.length) {
              await supabase.from('product_places').insert([{
                user_id: user.id, item_type: 'wine', item_id: newWine.id, kind: 'origin',
                place_name: ocrResult.locality || geoJ[0].display_name,
                lat: Number(geoJ[0].lat), lng: Number(geoJ[0].lon), is_primary: true,
              }])
            }
          }
        } catch {}
        // GPS dove lo bevo
        try {
          const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }))
          await supabase.from('product_places').insert([{
            user_id: user.id, item_type: 'wine', item_id: newWine.id, kind: 'purchase',
            place_name: null, lat: pos.coords.latitude, lng: pos.coords.longitude, is_primary: true,
          }])
        } catch {}
        setOcrResult(null)
        alert(`✅ Vino salvato!\n🍷 ${ocrResult.name || 'Vino'}${ocrResult.winery ? '\n🏠 ' + ocrResult.winery : ''}${ocrResult.vintage ? '\n📅 ' + ocrResult.vintage : ''}`)
        return
      }

      // ── SCONTRINO / FATTURA ──
      const pd = ocrResult.purchase_date ?? new Date().toISOString().slice(0, 10)
      const st = ocrResult.store ?? 'Generico'
      const im = parseFloat(ocrResult.price_total ?? 0)
      const cat = catFromStore(ocrResult.store, ocrResult.store_type)
        || (['casa','vestiti','cene','varie'].includes(ocrResult.categoria) ? ocrResult.categoria : 'varie')
      const pm = ocrResult.payment_method ?? 'unknown'
      const items = Array.isArray(ocrResult.items) ? ocrResult.items : []

      const { data: expRow, error: expErr } = await supabase.from('expenses').insert([{
        user_id: user.id, category: cat, store: st,
        store_address: ocrResult.store_address ?? null,
        description: `Spesa ${st} — ${pd}`,
        purchase_date: pd, amount: im, payment_method: pm, source: 'ocr',
      }]).select('id').single()
      if (expErr) throw new Error(expErr.message)

      let recId = null
      try {
        const { data: rr } = await supabase.from('receipts').insert([{
          user_id: user.id, expense_id: expRow?.id, store: st,
          store_address: ocrResult.store_address ?? null,
          purchase_date: pd, price_total: im, payment_method: pm,
          raw_text: ocrResult.raw_text ?? null, confidence: ocrResult.confidence ?? 'medium',
        }]).select('id').single(); recId = rr?.id ?? null
      } catch {}

      if (recId && items.length) try {
        await supabase.from('receipt_items').insert(items.map(it => ({
          receipt_id: recId, user_id: user.id, name: it.name,
          brand: it.brand ?? null, qty: it.qty ?? 1, unit: it.unit ?? 'pz',
          unit_price: it.unit_price ?? it.price ?? 0, price: it.price ?? 0,
          category_item: it.category_item ?? 'alimentari',
          expiry_date: it.expiry_date ?? null, purchase_date: pd,
        })))
      } catch {}

      // Aggiorna inventory per TUTTI i prodotti alimentari (non solo categoria casa)
      // casa = supermercato → inventory; cene = fuori casa → no inventory
      const itemsForInventory = items.filter(it => it.name && it.category_item !== 'altro')
      if (cat === 'casa' && itemsForInventory.length) for (const item of itemsForInventory) {
        try {
          const tot          = Number(item.qty || 1)
          const perishable   = item.perishable_type || 'standard'
          const catItem      = item.category_item   || 'alimentari'
          // Expiry: usa quella dello scontrino, oppure 2gg auto per freschi
          const expiryAuto   = perishable === 'fresh' && !item.expiry_date
            ? (() => { const d = new Date(pd); d.setDate(d.getDate()+2); return d.toISOString().slice(0,10) })()
            : (item.expiry_date ?? null)

          // Cerca per le prime 2 parole del nome (più preciso di 1 sola)
          const searchKey = item.name.split(' ').slice(0,2).join(' ')
          const { data: ex } = await supabase.from('inventory').select('id,qty,initial_qty')
            .eq('user_id', user.id).ilike('product_name', `%${searchKey}%`).maybeSingle()

          if (ex) {
            // Prodotto esistente: aggiorna quantità
            await supabase.from('inventory').update({
              qty:         Number(ex.qty || 0) + tot,
              initial_qty: Number(ex.initial_qty || 0) + tot,
              consumed_pct: 0,
              avg_price:   item.unit_price || item.price || 0,
              last_updated: new Date().toISOString(),
              perishable_type: perishable,
              ...(expiryAuto ? { expiry_date: expiryAuto } : {}),
            }).eq('id', ex.id)
          } else {
            // Prodotto nuovo: inserisci
            await supabase.from('inventory').insert({
              user_id:        user.id,
              product_name:   item.name,
              brand:          item.brand ?? null,
              category:       catItem,
              qty:            tot,
              initial_qty:    tot,
              avg_price:      item.unit_price || item.price || 0,
              purchase_date:  pd,
              expiry_date:    expiryAuto,
              consumed_pct:   0,
              perishable_type: perishable,
            })
          }
        } catch (invErr) { console.warn('[inv] skip', item.name, invErr?.message) }
      }

      // ── Spunta automatica lista spesa ──
      // Per ogni prodotto acquistato, cerca nella lista e spunta purchased=true
      if (items.length) {
        try {
          const { data: listaAperta } = await supabase
            .from('shopping_list')
            .select('id, name')
            .eq('user_id', user.id)
            .eq('purchased', false)

          if (listaAperta?.length) {
            const daSpuntare = []
            for (const item of items) {
              if (!item.name) continue
              const parola = item.name.split(' ')[0].toLowerCase()
              const match = listaAperta.find(l =>
                l.name.toLowerCase().includes(parola) ||
                parola.includes(l.name.toLowerCase().split(' ')[0])
              )
              if (match && !daSpuntare.includes(match.id))
                daSpuntare.push(match.id)
            }
            if (daSpuntare.length) {
              await supabase
                .from('shopping_list')
                .update({ purchased: true, updated_at: new Date().toISOString() })
                .in('id', daSpuntare)
            }
          }
        } catch (listErr) { console.warn('[lista] spunta skip:', listErr?.message) }
      }

      if (pm === 'cash' && im > 0) try {
        await supabase.from('pocket_cash').insert({
          user_id: user.id, note: `Spesa ${st} (${pd})`,
          delta: -im, moved_at: new Date().toISOString(),
        })
      } catch {}

      setOcrResult(null); if (userId) loadData(userId)
      alert(`✅ Salvato!\n🏪 ${st} — ${pd}\n💶 €${im.toFixed(2)}${items.length ? `\n🛒 ${items.length} prodotti` : ''}`)

    } catch (e) { setErr('❌ ' + (e.message || 'Errore')) }
    finally { setSaving(false) }
  }

  const nAlert = alertItems.length

  /* ══ RENDER ══ */
  return (
    <>
      <Head><title>Home – Jarvis</title></Head>

      {/* OCR overlay */}
      {loadingOCR && (
        <div className="ocr-overlay">
          <div className="ocr-ov-icon">📷</div>
          <div className="ocr-ov-title">Analisi immagine…</div>
          <div className="ocr-ov-sub">GPT-4o riconosce il documento</div>
          <div className="ocr-prog-track"><div className="ocr-prog-fill" /></div>
        </div>
      )}

      <div className="home-wrap">

        {/* ══ HERO LOGO ══ */}
        <div className="hero">
          <div className="logo-wrap">
            <div className="logo-halo logo-halo-a" />
            <div className="logo-halo logo-halo-b" />
            <div className="logo-halo logo-halo-c" />
            <div className="logo-inner">
              <span className="logo-j">J</span><span className="logo-arvis">ARVIS</span>
            </div>
          </div>
          <div className="hero-tagline">
            <span className="tagline-dot" />
            SMART HOME ASSISTANT
            <span className="tagline-dot" />
          </div>
        </div>

        {/* ══ KPI ══ */}
        <div className="kpi-row">
          <div className="kpi kpi-cyan">
            <div className="kpi-icon-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#22d3ee" strokeWidth="1.5"/>
                <path d="M12 7v5l3 3" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="kpi-label">In tasca</div>
              <div className="kpi-val">{pocketBal !== null ? `€ ${pocketBal.toFixed(2)}` : '—'}</div>
            </div>
          </div>

          <button className={`kpi kpi-alert ${nAlert > 0 ? 'kpi-alert--active' : ''}`} onClick={() => setShowLista(v => !v)}>
            <div className="kpi-icon-wrap">
              {nAlert > 0
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 20h20L12 2z" stroke="#f87171" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 9v5M12 17v.5" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              }
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="kpi-label">Scorte & Acquisti</div>
              <div className="kpi-val" style={{ color: nAlert > 0 ? '#f87171' : '#22c55e' }}>
                {nAlert > 0 ? `${nAlert} in alert` : 'Tutto ok'}
              </div>
            </div>
            <span className="kpi-chevron">{showLista ? '▲' : '▼'}</span>
          </button>
        </div>

        {/* Lista dropdown */}
        {showLista && (
          <div className="lista-drop">
            {alertItems.length === 0
              ? <div className="lista-empty">Nessun alert — ottimo!</div>
              : alertItems.map(item => (
                <div key={item.id} className={`lista-row ${item.type === 'lista' ? 'row-buy' : 'row-alert'}`}>
                  <span className="lista-name">{item.name}</span>
                  <span className="lista-tag">{item.tag}</span>
                </div>
              ))
            }
            <Link href="/liste-prodotti" className="lista-cta">Vai alla lista completa →</Link>
          </div>
        )}

        {/* ══ ZONA COMANDO — 3 icone ══ */}
        <div className="cmd-zone">

          {/* 🎙 MICROFONO — vocale */}
          <button
            className={`cmd-icon-btn ${isRec ? 'cib--rec' : ''} ${aibusy && !isRec ? 'cib--busy' : ''}`}
            onClick={toggleRec}
            disabled={aibusy && !isRec}
            title={isRec ? 'Ferma registrazione' : 'Parla con Jarvis'}
          >
            <span className="cib-ring" />
            <span className="cib-icon">
              {isRec ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <rect x="6" y="6" width="12" height="12" rx="2" fill="#f87171"/>
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <line x1="9" y1="21" x2="15" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              )}
            </span>
            <span className="cib-label">{isRec ? 'Stop' : aibusy ? '…' : 'Voce'}</span>
          </button>

          {/* ⌨️ TASTIERA — apre chat testo */}
          <button
            className={`cmd-icon-btn ${jarvisOpen ? 'cib--active' : ''}`}
            onClick={() => setJarvisOpen(v => !v)}
            title="Scrivi a Jarvis"
          >
            <span className="cib-ring" />
            <span className="cib-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                <line x1="6" y1="9" x2="6" y2="9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="10" y1="9" x2="10" y2="9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="9" x2="14" y2="9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="18" y1="9" x2="18" y2="9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="6" y1="13" x2="6" y2="13.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="10" y1="13" x2="10" y2="13.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="13" x2="14" y2="13.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="8" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="cib-label">Scrivi</span>
          </button>

          {/* 📷 CAMERA — OCR scontrino */}
          <label
            className={`cmd-icon-btn ${loadingOCR ? 'cib--busy' : ''}`}
            style={{cursor: loadingOCR ? 'wait' : 'pointer'}}
            title="Scansiona scontrino o etichetta"
          >
            <span className="cib-ring" />
            <span className="cib-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
            </span>
            <span className="cib-label">{loadingOCR ? '…' : 'OCR'}</span>
            {!loadingOCR && (
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleOCR(f) }} />
            )}
          </label>

          {/* 🧾 BOLLETTA — OCR bollette/fatture */}
          <label
            className={`cmd-icon-btn ${billBusy ? 'cib--busy' : ''}`}
            style={{cursor: billBusy ? 'wait' : 'pointer'}}
            title="Scansiona bolletta gas/luce/acqua"
          >
            <span className="cib-ring" />
            <span className="cib-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <polyline points="10 9 9 9 8 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="cib-label">{billBusy ? '…' : 'Bolletta'}</span>
            {!billBusy && (
              <input ref={billOcrRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleBillOcr(f) }} />
            )}
          </label>

          {/* 🔔 NOTIFICHE — attiva push */}
          {!pushEnabled && (
            <button
              className="cmd-icon-btn"
              onClick={() => enablePushNotifications(userId)}
              title="Attiva notifiche push"
            >
              <span className="cib-ring" />
              <span className="cib-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="cib-label">Alert</span>
            </button>
          )}

        </div>

        {/* ══ CHAT JARVIS ══ */}
        {jarvisOpen && (
          <div className="chat-panel">
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role === 'user' ? 'msg-user' : 'msg-ai'}`}>
                  {m.role === 'assistant' && <span className="chat-av">J</span>}
                  <div className="chat-bubble">
                    {m.text.split('\n').map((l, li) => <p key={li} style={{ margin: li > 0 ? '3px 0 0' : 0 }}>{l}</p>)}
                  </div>
                </div>
              ))}
              {aibusy && (
                <div className="chat-msg msg-ai">
                  <span className="chat-av">J</span>
                  <div className="chat-bubble chat-typing"><span /><span /><span /></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggerimenti */}
            <div className="chat-sugs">
              {[
                'Quanto mi resta questo mese?',
                'Quanto ho speso questo mese?',
                'Ho speso di più questo mese o il mese scorso?',
                'Cosa posso cucinare con quello che ho?',
                'Report mensile',
                'Cosa ho comprato questa settimana?',
                'Cosa ho in dispensa?',
                'Consiglimi un vino rosso',
                'Vino per una bistecca',
                'Quanto costava il latte?',
              ].map(s => (
                <button key={s} className="sug-pill" onClick={() => !aibusy && send(s)} disabled={aibusy}>{s}</button>
              ))}
            </div>

            {/* Input */}
            <form className="chat-form" onSubmit={onSubmit}>
              <button type="button" className={`chat-mic-btn ${isRec ? 'mic-rec' : ''}`}
                onClick={toggleRec} disabled={aibusy && !isRec} title={isRec ? 'Ferma registrazione' : 'Registra vocale'}>
                {isRec
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                }
              </button>
              <input className="chat-inp" value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="Scrivi o usa il microfono…"
                disabled={aibusy || isRec} />
              <button type="submit" className="chat-send"
                disabled={!textInput.trim() || aibusy || isRec}>↑</button>
            </form>
          </div>
        )}

        {/* OCR preview */}
        {ocrResult && (
          <div className="ocr-prev">
            <div className="ocr-prev-head">
              {ocrResult.doc_type === 'wine_label'
                ? <span>🍷 Etichetta vino rilevata</span>
                : <span>📋 {ocrResult.doc_type === 'invoice' ? 'Fattura' : 'Scontrino'} rilevato</span>
              }
              {ocrResult.confidence && (
                <span className={`conf ${ocrResult.confidence === 'high' ? 'conf-hi' : ocrResult.confidence === 'medium' ? 'conf-md' : 'conf-lo'}`}>
                  {ocrResult.confidence === 'high' ? '✓ Alta' : ocrResult.confidence === 'medium' ? '~ Media' : '⚠ Bassa'}
                </span>
              )}
            </div>
            <div className="ocr-prev-rows">
              {ocrResult.doc_type === 'wine_label' ? <>
                <div className="ocr-row"><span>Vino</span><strong>{ocrResult.name ?? '—'}</strong></div>
                <div className="ocr-row"><span>Cantina</span><strong>{ocrResult.winery ?? '—'}</strong></div>
                <div className="ocr-row"><span>Località</span><strong>{ocrResult.locality ?? ocrResult.region ?? '—'}</strong></div>
                {ocrResult.vintage && <div className="ocr-row"><span>Annata</span><strong>{ocrResult.vintage}</strong></div>}
                {ocrResult.alcohol && <div className="ocr-row"><span>Alcol</span><strong>{ocrResult.alcohol}%</strong></div>}
                {ocrResult.denomination && <div className="ocr-row"><span>Denominazione</span><strong>{ocrResult.denomination}</strong></div>}
              </> : <>
                <div className="ocr-row"><span>Negozio</span><strong>{ocrResult.store ?? '—'}</strong></div>
                <div className="ocr-row"><span>Data</span><strong>{ocrResult.purchase_date ?? '—'}</strong></div>
                <div className="ocr-row"><span>Totale</span><strong style={{ color: '#22c55e' }}>€ {parseFloat(ocrResult.price_total ?? 0).toFixed(2)}</strong></div>
                <div className="ocr-row"><span>Categoria</span><strong>{ocrResult.categoria ?? '—'}</strong></div>
                {Array.isArray(ocrResult.items) && ocrResult.items.length > 0 && (
                  <div className="ocr-row"><span>Prodotti</span><strong>{ocrResult.items.length} articoli</strong></div>
                )}
              </>}
            </div>
            <div className="ocr-prev-btns">
              <button className="ocr-save" onClick={salvaRisultato} disabled={saving}>
                {saving ? '⏳ Salvataggio…' : ocrResult.doc_type === 'wine_label' ? '🍷 Salva vino' : '✅ Conferma e salva'}
              </button>
              <button className="ocr-cancel" onClick={() => !saving && setOcrResult(null)} disabled={saving}>✕</button>
            </div>
          </div>
        )}

        {err && <div className="err-box">{err}</div>}

      </div>

      {/* ══ MODAL VOTO VINO — appare 30min dopo aver preso il vino ══ */}
      {showVoteModal && pendingVote && (
        <div className="vote-overlay" onClick={e => e.target === e.currentTarget && setShowVoteModal(false)}>
          <div className="vote-modal">
            <div className="vote-header">
              <span>🍷 Com&apos;era <strong>{pendingVote.wineName}</strong>?</span>
              <button onClick={() => setShowVoteModal(false)}
                style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:'1rem' }}>✕</button>
            </div>
            <p className="vote-hint">Il tuo feedback migliora i prossimi consigli del sommelier</p>

            <div className="vote-section">
              <div className="vote-label">⭐ Voto al vino</div>
              <div className="vote-stars">
                {[1,2,3,4,5].map(n => (
                  <span key={n} onClick={() => setWineVote(v => ({ ...v, ratingWine: n }))}
                    style={{ fontSize:'2rem', cursor:'pointer', color: n <= wineVote.ratingWine ? '#fbbf24' : '#1e293b', transition:'color .1s' }}>
                    {n <= wineVote.ratingWine ? '★' : '☆'}
                  </span>
                ))}
              </div>
            </div>

            <div className="vote-section">
              <div className="vote-label">🎯 Il consiglio del sommelier era azzeccato?</div>
              <div className="vote-stars">
                {[1,2,3,4,5].map(n => (
                  <span key={n} onClick={() => setWineVote(v => ({ ...v, ratingAdvice: n }))}
                    style={{ fontSize:'2rem', cursor:'pointer', color: n <= wineVote.ratingAdvice ? '#22d3ee' : '#1e293b', transition:'color .1s' }}>
                    {n <= wineVote.ratingAdvice ? '★' : '☆'}
                  </span>
                ))}
              </div>
              <div className="vote-labels-row">
                <span>Pessimo</span><span>Ottimo</span>
              </div>
            </div>

            <input className="vote-notes" placeholder="Note (sapore, abbinamento, occasione…)"
              value={wineVote.notes}
              onChange={e => setWineVote(v => ({ ...v, notes: e.target.value }))} />

            <button className="vote-submit"
              onClick={submitWineVote}
              disabled={!wineVote.ratingWine || !wineVote.ratingAdvice}>
              ✓ Invia feedback
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        
        

        .home-wrap {
          position: relative; z-index: 1; min-height: 100vh;
          display: flex; flex-direction: column; align-items: center; gap: 1.1rem;
          padding: 2.5rem 1rem 3rem; font-family: Inter, system-ui, sans-serif;
          max-width: 680px; margin: 0 auto;
          background: linear-gradient(180deg, #2aa9a9 0%, #114a52 38%, #0b2b31 100%);
          background-attachment: fixed;
        }

        /* ══ HERO ══ */
        .hero { display: flex; flex-direction: column; align-items: center; gap: .5rem; }
        .logo-wrap { position: relative; display: flex; align-items: center; justify-content: center; padding: 1.2rem 2rem; }

        .logo-halo {
          position: absolute; border-radius: 50%; pointer-events: none;
          border: 1px solid rgba(34,211,238,.18);
        }
        .logo-halo-a { width: 260px; height: 52px; animation: halo 3s ease-in-out infinite; }
        .logo-halo-b { width: 320px; height: 42px; border-color: rgba(34,211,238,.1); animation: halo 3s ease-in-out infinite .5s; }
        .logo-halo-c { width: 200px; height: 64px; border-color: rgba(56,189,248,.12); animation: halo 4s ease-in-out infinite 1s; }
        @keyframes halo { 0%,100%{opacity:.3;transform:scaleX(1)} 50%{opacity:1;transform:scaleX(1.04)} }

        .logo-inner { position: relative; display: flex; align-items: baseline; z-index: 1; }
        .logo-j {
          font-family: 'Orbitron', monospace; font-size: 5rem; font-weight: 900; color: #fff; line-height: 1;
          text-shadow: 0 0 16px rgba(34,211,238,.9), 0 0 40px rgba(34,211,238,.6), 0 0 80px rgba(34,211,238,.3);
          animation: glowJ 2.5s ease-in-out infinite;
        }
        .logo-arvis {
          font-family: 'Orbitron', monospace; font-size: 5rem; font-weight: 900; line-height: 1;
          background: linear-gradient(90deg,#5eead4,#22d3ee,#38bdf8,#22d3ee,#5eead4);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: shimmer 2.8s linear infinite; letter-spacing: 3px;
        }
        @keyframes glowJ {
          0%,100%{text-shadow:0 0 14px rgba(34,211,238,.8),0 0 32px rgba(34,211,238,.4)}
          50%{text-shadow:0 0 30px rgba(34,211,238,1),0 0 60px rgba(34,211,238,.7),0 0 100px rgba(56,189,248,.5)}
        }
        @keyframes shimmer { to { background-position: 200% center; } }

        .hero-tagline {
          display: flex; align-items: center; gap: .5rem;
          font-size: .62rem; letter-spacing: .45em; color: rgba(34,211,238,.45); text-transform: uppercase;
        }
        .tagline-dot { width: 4px; height: 4px; border-radius: 50%; background: rgba(34,211,238,.5); }

        /* ══ KPI ══ */
        .kpi-row { display: flex; gap: .7rem; width: 100%; }
        .kpi {
          flex: 1; display: flex; align-items: center; gap: .65rem;
          background: rgba(0,0,0,.6); border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px; padding: .8rem 1rem; text-align: left;
        }
        button.kpi { cursor: pointer; transition: border-color .15s, background .15s; }
        button.kpi:hover { background: rgba(255,255,255,.04); }
        .kpi-cyan { border-color: rgba(34,211,238,.25) !important; }
        .kpi-alert { border-color: rgba(255,255,255,.08); }
        .kpi-alert--active { border-color: rgba(239,68,68,.3) !important; }
        .kpi-icon-wrap { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; }
        .kpi-label { font-size: .64rem; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: .12rem; }
        .kpi-val { font-size: .95rem; font-weight: 700; color: #e2e8f0; }
        .kpi-chevron { margin-left: auto; font-size: .65rem; color: #334155; }

        /* ── Lista drop ── */
        .lista-drop {
          width: 100%; background: rgba(0,0,0,.75); border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px; overflow: hidden; animation: slideDown .18s ease;
        }
        @keyframes slideDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .lista-row { display: flex; align-items: center; justify-content: space-between; padding: .5rem .9rem; border-bottom: 1px solid rgba(255,255,255,.04); font-size: .8rem; }
        .row-buy  { border-left: 2px solid rgba(6,182,212,.4); }
        .row-alert{ border-left: 2px solid rgba(239,68,68,.4); }
        .lista-name { color: #e2e8f0; }
        .lista-tag  { font-size: .68rem; color: #475569; background: rgba(255,255,255,.05); border-radius: 4px; padding: .1rem .4rem; }
        .lista-empty{ padding: .9rem; text-align: center; font-size: .8rem; color: #334155; }
        .lista-cta  { display: block; padding: .55rem .9rem; text-align: center; font-size: .75rem; color: #22d3ee; border-top: 1px solid rgba(255,255,255,.06); text-decoration: none; }
        .lista-cta:hover { background: rgba(34,211,238,.04); }

        /* ══ ZONA COMANDO ══ */
        /* ══ ZONA COMANDO — 3 icone ══ */
        .cmd-zone {
          display: flex; gap: 1rem; width: 100%;
          justify-content: center; padding: .5rem 0;
        }

        /* Bottone icona base */
        .cmd-icon-btn {
          position: relative;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: .55rem; width: 88px; height: 88px;
          background: rgba(0,6,15,.7); border: 1px solid rgba(255,255,255,.12);
          border-radius: 22px; cursor: pointer;
          color: rgba(148,163,184,.8);
          transition: color .18s, border-color .18s, box-shadow .18s, background .18s;
          overflow: hidden;
        }
        .cmd-icon-btn:hover {
          color: #e2e8f0; border-color: rgba(34,211,238,.45);
          background: rgba(34,211,238,.07);
          box-shadow: 0 0 20px -6px rgba(34,211,238,.35);
        }
        .cmd-icon-btn:nth-child(3):hover {
          border-color: rgba(245,158,11,.45);
          background: rgba(245,158,11,.07);
          box-shadow: 0 0 20px -6px rgba(245,158,11,.35);
        }
        /* Mic attivo = registrazione in corso */
        .cib--rec {
          color: #f87171 !important; border-color: rgba(239,68,68,.6) !important;
          background: rgba(239,68,68,.1) !important;
          box-shadow: 0 0 20px -4px rgba(239,68,68,.4) !important;
          animation: recPulse 1s ease-in-out infinite;
        }
        @keyframes recPulse { 0%,100%{box-shadow:0 0 14px -4px rgba(239,68,68,.4)} 50%{box-shadow:0 0 28px -2px rgba(239,68,68,.7)} }

        /* Chat tastiera aperta */
        .cib--active {
          color: #22d3ee !important; border-color: rgba(34,211,238,.6) !important;
          background: rgba(34,211,238,.1) !important;
        }
        /* Busy */
        .cib--busy { opacity: .45; pointer-events: none; cursor: not-allowed; }

        /* Anello pulsante dietro */
        .cib-ring {
          position: absolute; inset: -1px; border-radius: 22px;
          border: 1px solid transparent; pointer-events: none;
          transition: border-color .18s;
        }
        .cmd-icon-btn:hover .cib-ring { border-color: rgba(34,211,238,.2); }
        .cmd-icon-btn:nth-child(3):hover .cib-ring { border-color: rgba(245,158,11,.2); }

        .cib-icon { display: flex; align-items: center; justify-content: center; }
        .cib-label {
          font-size: .62rem; font-weight: 700; letter-spacing: .08em;
          text-transform: uppercase; color: inherit; line-height: 1;
        }

        /* ══ CHAT ══ */
        .chat-panel {
          width: 100%; background: rgba(0,4,12,.85);
          border: 1px solid rgba(34,211,238,.2); border-radius: 18px; overflow: hidden;
          animation: slideDown .2s ease;
        }
        .chat-messages { max-height: 280px; overflow-y: auto; padding: .7rem .9rem; display: flex; flex-direction: column; gap: .5rem; }
        .chat-msg { display: flex; align-items: flex-start; gap: .4rem; }
        .msg-ai   { flex-direction: row; }
        .msg-user { flex-direction: row-reverse; }
        .chat-av  { width: 20px; height: 20px; border-radius: 50%; background: rgba(34,211,238,.12); border: 1px solid rgba(34,211,238,.3); display: flex; align-items: center; justify-content: center; font-size: .55rem; font-weight: 900; color: #22d3ee; flex-shrink: 0; margin-top: 2px; }
        .chat-bubble { max-width: 88%; padding: .45rem .7rem; border-radius: 10px; font-size: .8rem; line-height: 1.5; color: #e2e8f0; }
        .msg-ai   .chat-bubble { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.07); }
        .msg-user .chat-bubble { background: rgba(99,102,241,.2); border: 1px solid rgba(99,102,241,.3); color: #c7d2fe; }
        .chat-typing { display: flex; gap: 4px; align-items: center; }
        .chat-typing span { width: 5px; height: 5px; border-radius: 50%; background: #22d3ee; animation: typing .9s infinite; }
        .chat-typing span:nth-child(2){animation-delay:.2s} .chat-typing span:nth-child(3){animation-delay:.4s}
        @keyframes typing { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }

        .chat-sugs { display: flex; flex-wrap: wrap; gap: .3rem; padding: .4rem .7rem; border-top: 1px solid rgba(255,255,255,.05); }
        .sug-pill { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; color: #475569; font-size: .67rem; padding: .2rem .55rem; cursor: pointer; white-space: nowrap; transition: color .15s,border-color .15s; }
        .sug-pill:hover:not(:disabled) { color: #22d3ee; border-color: rgba(34,211,238,.3); }
        .sug-pill:disabled { opacity: .4; cursor: not-allowed; }

        .chat-form { display: flex; gap: .4rem; padding: .5rem .7rem; border-top: 1px solid rgba(255,255,255,.05); }
        .chat-mic-btn { background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.3); border-radius: 8px; color: #22d3ee; width: 34px; height: 34px; cursor: pointer; font-size: .9rem; flex-shrink: 0; }
        .mic-rec { background: rgba(239,68,68,.2) !important; border-color: rgba(239,68,68,.4) !important; color: #f87171 !important; animation: pulsRec 1s ease-in-out infinite; }
        @keyframes pulsRec { 0%,100%{opacity:1} 50%{opacity:.5} }
        .chat-inp { flex: 1; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: #e2e8f0; padding: .38rem .65rem; font-size: .8rem; outline: none; }
        .chat-inp:focus { border-color: rgba(34,211,238,.4); }
        .chat-send { background: rgba(34,211,238,.15); border: 1px solid rgba(34,211,238,.3); border-radius: 8px; color: #22d3ee; width: 32px; cursor: pointer; font-size: .9rem; }
        .chat-send:disabled { opacity: .3; cursor: not-allowed; }

        /* ══ OCR PREVIEW ══ */
        .ocr-prev { width: 100%; background: rgba(0,0,0,.75); border: 1px solid rgba(34,197,94,.25); border-radius: 16px; padding: .9rem 1rem; }
        .ocr-prev-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .65rem; font-size: .85rem; font-weight: 600; color: #e2e8f0; }
        .conf { font-size: .67rem; padding: .17rem .5rem; border-radius: 20px; font-weight: 700; }
        .conf-hi { background: rgba(34,197,94,.15); color: #22c55e; }
        .conf-md { background: rgba(251,191,36,.15); color: #fbbf24; }
        .conf-lo { background: rgba(239,68,68,.15); color: #f87171; }
        .ocr-prev-rows { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .65rem; }
        .ocr-row { display: flex; justify-content: space-between; font-size: .8rem; }
        .ocr-row span { color: #475569; } .ocr-row strong { color: #e2e8f0; }
        .ocr-prev-btns { display: flex; gap: .6rem; }
        .ocr-save { flex: 1; background: #22c55e; border: none; border-radius: 10px; color: #fff; font-size: .8rem; font-weight: 700; padding: .5rem; cursor: pointer; }
        .ocr-save:disabled { opacity: .5; cursor: not-allowed; }
        .ocr-cancel { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; color: #64748b; font-size: .8rem; padding: .5rem .8rem; cursor: pointer; }

        /* OCR overlay */
        .ocr-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.82); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .8rem; color: #fff; }
        .ocr-ov-icon { font-size: 2.5rem; }
        .ocr-ov-title { font-size: 1rem; font-weight: 700; }
        .ocr-ov-sub { font-size: .8rem; opacity: .6; }
        .ocr-prog-track { width: 160px; height: 3px; background: rgba(255,255,255,.12); border-radius: 2px; overflow: hidden; }
        .ocr-prog-fill { height: 100%; background: #f59e0b; border-radius: 2px; animation: ocrProg 35s linear forwards; }
        @keyframes ocrProg { from{width:0} to{width:100%} }

        .err-box { width: 100%; background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.25); border-radius: 12px; padding: .7rem .9rem; color: #f87171; font-size: .8rem; }

        /* ── Modal voto vino ── */
        .vote-overlay { position:fixed; inset:0; z-index:200; display:flex; align-items:flex-end; justify-content:center; background:rgba(0,0,0,.7); backdrop-filter:blur(6px); padding:0; }
        .vote-modal { background:linear-gradient(160deg,#0c1a1f 0%,#07141a 100%); border:1px solid rgba(255,255,255,.1); border-radius:24px 24px 0 0; width:100%; max-width:480px; padding:1.5rem 1.5rem 2rem; display:flex; flex-direction:column; gap:.9rem; animation:slideUp .25s ease; }
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        .vote-header { display:flex; justify-content:space-between; align-items:center; font-size:.95rem; font-weight:700; color:#e2e8f0; }
        .vote-hint { font-size:.74rem; color:#475569; }
        .vote-section { display:flex; flex-direction:column; gap:.35rem; }
        .vote-label { font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; color:#64748b; font-weight:600; }
        .vote-stars { display:flex; gap:.4rem; }
        .vote-labels-row { display:flex; justify-content:space-between; font-size:.65rem; color:#334155; margin-top:.1rem; }
        .vote-notes { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); border-radius:10px; color:#e2e8f0; padding:.6rem .8rem; font-size:.82rem; outline:none; width:100%; }
        .vote-notes:focus { border-color:rgba(34,211,238,.4); }
        .vote-submit { background:linear-gradient(90deg,#22d3ee,#6366f1); border:none; border-radius:12px; color:#fff; font-size:.88rem; font-weight:700; padding:.7rem; cursor:pointer; width:100%; transition:opacity .15s; }
        .vote-submit:disabled { opacity:.35; cursor:not-allowed; }

        @media (max-width: 480px) {
          .logo-j, .logo-arvis { font-size: 3.5rem; }
          .cmd-zone { flex-direction: column; }
          .kpi-row  { flex-direction: column; }
          .home-wrap { padding: 2rem .75rem 3rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .logo-halo,.logo-j,.logo-arvis,.ai-plasma,.ai-core,.ai-spark,
          .ocr-scan,.ocr-qr-wrap,.ocr-qr-svg { animation: none !important; }
        }
      `}</style>
    </>
  )
}

export default withAuth(Home)
export async function getServerSideProps() { return { props: {} } }