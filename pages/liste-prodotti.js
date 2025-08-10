
    // 2) aggiorna scorte
    setStock(prev => {
      const arr = [...prev];
      const todayISO = new Date().toISOString().slice(0,10);
      const idx = arr.findIndex(s => isSimilar(s.name, item.name) && (!item.brand || isSimilar(s.brand||'', item.brand)));
      if (idx >= 0) {
        const old = arr[idx];
        const newPacks = Number(old.packs || 0) + movePacks;
        arr[idx] = {
          ...old,
          packs: newPacks,
          unitsPerPack: old.unitsPerPack || moveUPP,
          unitLabel: old.unitLabel || moveLabel,
          baselinePacks: newPacks,
          lastRestockAt: todayISO
        };
      } else {
        arr.unshift({
          name: item.name,
          brand: item.brand || '',
          packs: movePacks,
          unitsPerPack: moveUPP,
          unitLabel: moveLabel,
          expiresAt: '',
          baselinePacks: movePacks,
          lastRestockAt: todayISO,
          avgDailyUnits: 0
        });
      }
      return arr;
    });
  }

  /* ---------------- Vocale: LISTA (aggiunta veloce) ---------------- */
  async function toggleRecList() {
    if (recBusy) {
      try { mediaRecRef.current?.stop(); } catch {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => { if (e.data?.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = processVoiceList;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch {
      alert('Microfono non disponibile');
    }
  }

  async function processVoiceList() {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
    try {
      setBusy(true);
      const res = await timeoutFetch('/api/stt', { method: 'POST', body: fd }, 25000);
      const { text } = await res.json();
      if (DEBUG) console.log('[STT list] text:', text);
      if (!text) throw new Error('Testo non riconosciuto');

      let appended = false;
      try {
        const payload = {
          prompt: [
            'Sei Jarvis. Capisci una LISTA SPESA. Rispondi SOLO JSON:',
            '{ "items":[{ "name":"latte","brand":"Parmalat","qty":2,"unitsPerPack":1,"unitLabel":"unità" }, ...] }',
            'Se manca brand metti stringa vuota, qty default 1, unitsPerPack default 1, unitLabel "unità".',
            'Voci comuni: ' + GROCERY_LEXICON.join(', '),
            'Testo:', text
          ].join('\n'),
        };
        const r = await timeoutFetch(API_ASSISTANT_TEXT, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
        }, 25000);
        const safe = await readJsonSafe(r);
        const answer = safe?.answer || safe?.data || safe;
        const parsed = typeof answer === 'string' ? (()=>{ try{ return JSON.parse(answer);}catch{return null;}})() : answer;
        const arr = Array.isArray(parsed?.items) ? parsed.items : [];
        if (arr.length) {
          setLists(prev => {
            const next = { ...prev };
            const target = currentList;
            const existing = [...(prev[target] || [])];
            for (const raw of arr) {
              const it = {
                id: 'tmp-' + Math.random().toString(36).slice(2),
                name: String(raw.name||'').trim(),
                brand: String(raw.brand||'').trim(),
                qty: Math.max(1, Number(raw.qty||1)),
                unitsPerPack: Math.max(1, Number(raw.unitsPerPack||1)),
                unitLabel: String(raw.unitLabel||'unità'),
                purchased: false,
              };
              if (!it.name) continue;
              const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && (i.brand||'').toLowerCase() === it.brand.toLowerCase());
              if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + it.qty, unitsPerPack: it.unitsPerPack, unitLabel: it.unitLabel };
              else existing.push(it);
            }
            next[target] = existing;
            return next;
          });
          appended = true;
        }
      } catch {}

      if (!appended) {
        const local = parseLinesToItems(text);
        if (local.length) {
          setLists(prev => {
            const next = { ...prev };
            const target = currentList;
            const existing = [...(prev[target] || [])];
            for (const it of local) {
              const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && (i.brand||'').toLowerCase() === (it.brand||'').toLowerCase());
              if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + Number(it.qty || 1), unitsPerPack: it.unitsPerPack || 1, unitLabel: it.unitLabel || 'unità' };
              else existing.push(it);
            }
            next[target] = existing;
            return next;
          });
          appended = true;
        }
      }

      showToast(appended ? 'Lista aggiornata da Vocale ✓' : 'Nessun elemento riconosciuto', appended ? 'ok' : 'err');
    } catch {
      alert('Errore nel riconoscimento vocale');
    } finally {
      setRecBusy(false);
      setBusy(false);
      try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      mediaRecRef.current = null;
      streamRef.current = null;
      recordedChunks.current = [];
    }
  }

  /* ---------------- OCR: supporto decremento su entrambe le liste ---------------- */
  function decrementAcrossBothLists(prevLists, purchases) {
    const next = { ...prevLists };
    const decList = (listKey) => {
      const arr = [...(next[listKey] || [])];
      for (const p of purchases) {
        const dec = Math.max(1, Number(p.packs ?? p.qty ?? 1)); // qty legacy → packs
        const idx = arr.findIndex(i => isSimilar(i.name, p.name) && (!p.brand || isSimilar(i.brand || '', p.brand || '')));
        if (idx >= 0) {
          const newQty = Math.max(0, Number(arr[idx].qty || 0) - dec);
          arr[idx] = { ...arr[idx], qty: newQty, purchased: true };
        }
      }
      next[listKey] = arr.filter(i => Number(i.qty || 0) > 0 || !i.purchased);
    };
    decList(LIST_TYPES.SUPERMARKET);
    decList(LIST_TYPES.ONLINE);
    return next;
  }

  /* ---------------- OCR: scontrini ---------------- */
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      setBusy(true);

      // 1) OCR testo dallo scontrino
      const fdOcr = new FormData();
      files.forEach((f) => fdOcr.append('images', f));
      const ocrRes = await timeoutFetch(API_OCR, { method: 'POST', body: fdOcr }, 40000);
      const ocrJson = await readJsonSafe(ocrRes);
      if (!ocrJson.ok) throw new Error(ocrJson.error || `HTTP ${ocrRes.status}`);
      const ocrText = String(ocrJson?.text || '').trim();
      if (!ocrText) throw new Error('Risposta vuota dal servizio OCR');

      // 2) Estrazione strutturata con Assistant
      const prompt = buildOcrAssistantPrompt(ocrText, GROCERY_LEXICON);
      const r = await timeoutFetch(API_ASSISTANT_TEXT, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt })
      }, 30000);
      const safe = await readJsonSafe(r);
      const answer = safe?.answer || safe?.data || safe;
      const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer);} catch { return null; } })() : answer;

      let purchases = ensureArray(parsed?.purchases);

      // fallback locale
      if (!purchases.length) purchases = parseReceiptPurchases(ocrText);

      // 3) aggiorna liste, scorte e finanze
      if (purchases.length) {
        setLists(prev => decrementAcrossBothLists(prev, purchases));
        setStock(prev => {
          const arr = [...prev];
          const todayISO = new Date().toISOString().slice(0,10);
          for (const p of purchases) {
            const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
            const pack = {
              packs: Number(p.packs ?? p.qty ?? 1),
              unitsPerPack: Number(p.unitsPerPack ?? 1),
              unitLabel: p.unitLabel || 'unità'
            };
            if (idx >= 0) {
              const old = arr[idx];
              const newPacks = Number(old.packs || 0) + pack.packs;
              arr[idx] = {
                ...old,
                packs: newPacks,
                unitsPerPack: old.unitsPerPack || pack.unitsPerPack,
                unitLabel: old.unitLabel || pack.unitLabel,
                baselinePacks: newPacks,
                lastRestockAt: todayISO
              };
            } else {
              arr.unshift({
                name: p.name, brand: p.brand || '',
                packs: pack.packs,
                unitsPerPack: pack.unitsPerPack,
                unitLabel: pack.unitLabel,
                expiresAt: '',
                baselinePacks: pack.packs,
                lastRestockAt: todayISO,
                avgDailyUnits: 0
              });
            }
          }
          return arr;
        });
        try {
          await fetch(API_FINANCES_INGEST, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ purchases })
          });
        } catch {}
      }

      showToast('OCR scontrino elaborato ✓', 'ok');
    } catch (e) {
      console.error('[OCR] error', e);
      showToast(`Errore OCR: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  }

  /* ---------------- Modifiche scorte: inline + prompt ---------------- */

  // Calcola nuovo avgDailyUnits quando il totale unità diminuisce rispetto al baseline precedente.
  function calcNewAvgDailyUnits(old, newPacks) {
    const upp = Math.max(1, Number(old.unitsPerPack || 1));
    const oldUnits = Number(old.baselinePacks || old.packs || 0) * upp;
    const newUnits = Number(newPacks || 0) * upp;
    let avg = old?.avgDailyUnits || 0;
    if (old?.lastRestockAt && newUnits < oldUnits) {
      const days = Math.max(1, (Date.now() - new Date(old.lastRestockAt).getTime())/86400000);
      const usedUnits = oldUnits - newUnits;
      const day = usedUnits / days;
      avg = avg ? (0.6*avg + 0.4*day) : day; // smoothing
    }
    return avg;
  }

  function setStockPacks(i, packs) {
    setStock(prev => {
      const arr = [...prev];
      const old = arr[i]; if (!old) return prev;
      const p = Math.max(0, Number(String(packs).replace(',','.')) || 0);
      const avgDailyUnits = calcNewAvgDailyUnits(old, p);
      arr[i] = { ...old, packs: p, baselinePacks: p, avgDailyUnits };
      return arr;
    });
  }

  function adjustStockPacks(i, deltaPacks) {
    setStock(prev => {
      const arr = [...prev];
      const old = arr[i]; if (!old) return prev;
      const p = Math.max(0, Number(old.packs || 0) + Number(deltaPacks || 0));
      const avgDailyUnits = calcNewAvgDailyUnits(old, p);
      arr[i] = { ...old, packs: p, baselinePacks: p, avgDailyUnits };
      return arr;
    });
  }

  function setStockUnitsPerPack(i, unitsPerPack) {
    setStock(prev => {
      const arr = [...prev];
      const old = arr[i]; if (!old) return prev;
      const upp = Math.max(1, Number(String(unitsPerPack).replace(',','.')) || 1);
      // Se cambio UPP, ricalcolo avgDailyUnits solo se diminuiscono le unità totali rispetto al baseline (con il vecchio upp).
      const oldTotUnits = Number(old.baselinePacks || old.packs || 0) * Math.max(1, Number(old.unitsPerPack || 1));
      const newTotUnits = Number(old.baselinePacks || old.packs || 0) * upp;
      let avg = old?.avgDailyUnits || 0;
      if (old?.lastRestockAt && newTotUnits < oldTotUnits) {
        const days = Math.max(1, (Date.now() - new Date(old.lastRestockAt).getTime())/86400000);
        const usedUnits = oldTotUnits - newTotUnits;
        const day = usedUnits / days;
        avg = avg ? (0.6*avg + 0.4*day) : day;
      }
      arr[i] = { ...old, unitsPerPack: upp, avgDailyUnits: avg };
      return arr;
    });
  }

  function adjustStockUnits(i, deltaUnits) {
    // cambia il TOTALE unità di ±1 (o più) e ricalcola packs = totalUnits / upp
    setStock(prev => {
      const arr = [...prev];
      const old = arr[i]; if (!old) return prev;
      const upp = Math.max(1, Number(old.unitsPerPack || 1));
      const curUnits = Math.max(0, Number(old.packs || 0) * upp);
      const newUnits = Math.max(0, curUnits + Number(deltaUnits || 0));
      const newPacks = newUnits / upp; // possono essere decimali
      const avgDailyUnits = calcNewAvgDailyUnits(old, newPacks);
      arr[i] = { ...old, packs: newPacks, baselinePacks: newPacks, avgDailyUnits };
      return arr;
    });
  }

  function editStockRow(i) {
    const it = stock[i];
    if (!it) return;
    const name = prompt('Nome prodotto:', it.name);
    if (name == null || !name.trim()) return;
    const brand = prompt('Marca (opzionale):', it.brand || '');
    if (brand == null) return;

    const packsStr = prompt('Confezioni (può essere decimale es. 1.5):', String(it.packs ?? 0));
    if (packsStr == null) return;
    const packs = Math.max(0, Number(String(packsStr).replace(',','.')) || 0);

    const uppStr = prompt('Unità per confezione:', String(it.unitsPerPack ?? 1));
    if (uppStr == null) return;
    const unitsPerPack = Math.max(1, Number(String(uppStr).replace(',','.')) || 1);

    const unitLabel = prompt('Etichetta unità (es. unità, bottiglie, vasetti):', it.unitLabel || 'unità');
    if (unitLabel == null) return;

    const expStr = prompt('Scadenza (YYYY-MM-DD) opzionale:', it.expiresAt || '');
    const ex = expStr ? toISODate(expStr) : '';

    setStock(prev => {
      const arr = [...prev];
      const old = arr[i];
      let avgDailyUnits = old?.avgDailyUnits || 0;
      if (old?.lastRestockAt && (old.packs*old.unitsPerPack) > (packs*unitsPerPack)) {
        const days = Math.max(1, (Date.now() - new Date(old.lastRestockAt).getTime())/86400000);
        const usedUnits = (old.packs*old.unitsPerPack) - (packs*unitsPerPack);
        const day = usedUnits / days;
        avgDailyUnits = avgDailyUnits ? (0.6*avgDailyUnits + 0.4*day) : day;
      }
      arr[i] = {
        ...old,
        name: name.trim(),
        brand: (brand||'').trim(),
        packs, unitsPerPack, unitLabel,
        expiresAt: ex || '',
        avgDailyUnits,
        baselinePacks: packs
      };
      return arr;
    });
  }

  function deleteStockRow(i) {
    const it = stock[i];
    if (!it) return;
    if (!confirm(`Eliminare "${it.name}${it.brand?  ` (${it.brand})`:''}" dalle scorte?`)) return;
    setStock(prev => prev.filter((_, idx) => idx !== i));
  }

  /* ---------------- OCR scadenza per riga ---------------- */
  function openRowOcr(idx) {
    setTargetRowIdx(idx);
    rowOcrInputRef.current?.click();
  }
  async function handleRowOcrChange(files) {
    if (targetRowIdx == null || !files?.length) return;
    const row = stock[targetRowIdx];
    try {
      setBusy(true);

      const fd = new FormData();
      files.forEach((f)=>fd.append('images', f));
      const ocrRes = await timeoutFetch(API_OCR, { method:'POST', body: fd }, 30000);
      const ocrJson = await readJsonSafe(ocrRes);
      if (!ocrJson.ok) throw new Error(ocrJson.error || `HTTP ${ocrRes.status}`);
      const ocrText = String(ocrJson?.text || '').trim();
      if (!ocrText) throw new Error('Risposta vuota dal servizio OCR');

      const prompt = buildExpiryPrompt(row.name, row.brand || '', ocrText);
      const r = await timeoutFetch(API_ASSISTANT_TEXT, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt })
      }, 25000);
      const safe = await readJsonSafe(r);
      const answer = safe?.answer || safe?.data || safe;
      const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer);} catch { return null; } })() : answer;

      const ex = ensureArray(parsed?.expiries)[0];
      const iso = ex?.expiresAt ? toISODate(ex.expiresAt) : '';
      if (iso) {
        setStock(prev => {
          const arr = [...prev];
          if (arr[targetRowIdx]) arr[targetRowIdx] = { ...arr[targetRowIdx], expiresAt: iso };
          return arr;
        });
        showToast('Scadenza assegnata ✓', 'ok');
      } else {
        showToast('Scadenza non riconosciuta', 'err');
      }
    } catch (e) {
      console.error('[OCR row] error', e);
      showToast(`Errore OCR scadenza: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      setTargetRowIdx(null);
      if (rowOcrInputRef.current) rowOcrInputRef.current.value = '';
    }
  }

  /* ---------------- Vocale UNIFICATO: SCADENZE + AGGIORNA SCORTE ---------------- */
  async function toggleVoiceInventory() {
    if (invRecBusy) { try { invMediaRef.current?.stop(); } catch {} return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      invStreamRef.current = stream;
      invMediaRef.current = new MediaRecorder(stream);
      invChunksRef.current = [];
      invMediaRef.current.ondataavailable = (e) => { if (e.data?.size) invChunksRef.current.push(e.data); };
      invMediaRef.current.onstop = processVoiceInventory;
      invMediaRef.current.start();
      setInvRecBusy(true);
    } catch {
      alert('Microfono non disponibile');
    }
  }

  async function processVoiceInventory() {
    const blob = new Blob(invChunksRef.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'inventory.webm');
    try {
      setBusy(true);
      const res = await timeoutFetch('/api/stt', { method:'POST', body: fd }, 25000);
      const { text } = await res.json();
      if (DEBUG) console.log('[STT inventory] text:', text);
      if (!text) { showToast('Nessun testo riconosciuto', 'err'); return; }

      // Heuristica veloce
      const looksExpiry = /scad|scadenza|scade|entro|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/i.test(text);

      // Parser locali
      let localIntent = looksExpiry ? 'expiry' : 'stock_update';
      let localExpiries = looksExpiry ? parseExpiryPairs(text, GROCERY_LEXICON, stock.map(s=>s.name)) : [];
      let localUpdates = !looksExpiry ? parseStockUpdateText(text) : [];

      let intent = localIntent;
      let updates = localUpdates;
      let expiries = localExpiries;

      // Se locale non trova nulla, prova Assistant
      if ((intent === 'expiry' && !expiries.length) || (intent === 'stock_update' && !updates.length)) {
        try {
          const prompt = buildInventoryIntentPrompt(text);
          const r = await timeoutFetch(API_ASSISTANT_TEXT, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt })
          }, 25000);
          const safe = await readJsonSafe(r);
          const answer = safe?.answer || safe?.data || safe;
          const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer);} }catch{ return null;})() : answer;
          const pIntent = parsed?.intent;
          if (pIntent === 'expiry') {
            intent = 'expiry';
            expiries = ensureArray(parsed?.expiries).map(e => ({ name:String(e.name||'').trim(), expiresAt: toISODate(e.expiresAt) })).filter(e=>e.name && e.expiresAt);
          } else if (pIntent === 'stock_update') {
            intent = 'stock_update';
            updates = ensureArray(parsed?.updates).map(u => ({
              name:String(u.name||'').trim(),
              mode:(u.mode==='units'?'units':'packs'),
              value: Math.max(0, Number(u.value||0)),
              op: 'add' // di default aggiunge se non specificato
            })).filter(u => u.name && u.value>0);
          }
        } catch (e) {
          if (DEBUG) console.warn('[Assistant intent fallback error]', e);
        }
      }

      if (intent === 'expiry' && expiries.length) {
        let hit = 0;
        setStock(prev => {
          const arr = [...prev];
          for (const p of expiries) {
            const idx = arr.findIndex(s => isSimilar(s.name, p.name));
            if (idx >= 0) { arr[idx] = { ...arr[idx], expiresAt: p.expiresAt || arr[idx].expiresAt }; hit++; }
          }
          return arr;
        });
        showToast(hit ? `Aggiornate ${hit} scadenze ✓` : 'Nessun prodotto corrispondente', hit ? 'ok' : 'err');
        return;
      }

      if (intent === 'stock_update' && updates.length) {
        let applied = 0;
        setStock(prev => {
          const arr = [...prev];
          const todayISO = new Date().toISOString().slice(0,10);

          for (const u of updates) {
            let idx = arr.findIndex(s => isSimilar(s.name, u.name));
            const isSet = (u.op === 'set');
            const isUnits = (u.mode === 'units');

            if (idx < 0) {
              // crea nuova riga scorte
              if (isUnits) {
                if (isSet) {
                  arr.unshift({
                    name: u.name, brand: '',
                    packs: Math.max(1, Math.ceil(Number(u.value||1))),
                    unitsPerPack: 1, unitLabel:'unità',
                    expiresAt:'', baselinePacks: Math.max(1, Math.ceil(Number(u.value||1))),
                    lastRestockAt: todayISO, avgDailyUnits:0
                  });
                } else {
                  arr.unshift({
                    name: u.name, brand: '',
                    packs: 1, unitsPerPack: Math.max(1, Math.round(Number(u.value||1))), unitLabel:'unità',
                    expiresAt:'', baselinePacks:1,
                    lastRestockAt: todayISO, avgDailyUnits:0
                  });
                }
              } else {
                const p = Math.max(0, Number(u.value||0));
                arr.unshift({
                  name: u.name, brand: '',
                  packs: p, unitsPerPack:1, unitLabel:'unità',
                  expiresAt:'', baselinePacks: p,
                  lastRestockAt: todayISO, avgDailyUnits:0
                });
              }
              applied++;
              continue;
            }

            // Esiste già
            const old = arr[idx];
            const upp = Math.max(1, Number(old.unitsPerPack || 1));
            const unitLabel = old.unitLabel || 'unità';
            let packs = Number(old.packs || 0);

            if (isUnits) {
              const currentUnits = packs * upp;
              const valUnits = Math.max(0, Number(u.value || 0));
              const newUnits = isSet ? valUnits : (currentUnits + valUnits);
              packs = newUnits / upp; // confezioni decimali permesse
            } else {
              const valPacks = Math.max(0, Number(u.value || 0));
              packs = isSet ? valPacks : (packs + valPacks);
            }

            let avgDailyUnits = old?.avgDailyUnits || 0;
            if (old?.lastRestockAt && Number(old.baselinePacks||0) * upp > packs * upp) {
              const days = Math.max(1, (Date.now() - new Date(old.lastRestockAt).getTime())/86400000);
              const usedUnits = (Number(old.baselinePacks||0)*upp) - (packs*upp);
              const day = usedUnits / days;
              avgDailyUnits = avgDailyUnits ? (0.6*avgDailyUnits + 0.4*day) : day;
            }

            const baselinePacks = packs;

            arr[idx] = { ...old, packs, unitsPerPack: upp, unitLabel, avgDailyUnits, baselinePacks, lastRestockAt: todayISO };
            applied++;
          }
          return arr;
        });
        showToast(applied ? `Aggiornate ${applied} scorte ✓` : 'Nessuna scorta aggiornata', applied ? 'ok' : 'err');
        return;
      }

      showToast('Nessuna scorta/scadenza riconosciuta', 'err');
    } catch (e) {
      console.error('[Voice Inventory] error', e);
      showToast(`Errore vocale inventario: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      setInvRecBusy(false);
      try { invStreamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      invMediaRef.current = null;
      invStreamRef.current = null;
      invChunksRef.current = [];
    }
  }

  /* ---------------- render ---------------- */
  return (
    <>
      <Head><title>🛍 Lista Prodotti</title></Head>

      <div style={styles.page}>
        <div style={styles.card}>
          {/* Header */}
          <div style={styles.headerRow}>
            <h2 style={{margin:0}}>🛍 Lista Prodotti</h2>
            <Link href="/home" legacyBehavior><a style={styles.homeBtn}>Home</a></Link>
          </div>

          {/* Switch lista */}
          <div style={styles.switchRow}>
            <button onClick={() => setCurrentList(LIST_TYPES.SUPERMARKET)}
                    style={currentList === LIST_TYPES.SUPERMARKET ? styles.switchBtnActive : styles.switchBtn}>
              Lista Supermercato
            </button>
            <button onClick={() => setCurrentList(LIST_TYPES.ONLINE)}
                    style={currentList === LIST_TYPES.ONLINE ? styles.switchBtnActive : styles.switchBtn}>
              Lista Spesa Online
            </button>
          </div>

          {/* Comandi Lista */}
          <div style={styles.toolsRow}>
            <button onClick={toggleRecList} style={styles.voiceBtn} disabled={busy}>
              {recBusy ? '⏹️ Stop' : '🎙 Vocale Lista'}
            </button>
          </div>

          {/* Lista corrente */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>
              Lista corrente: <span style={{opacity:.85}}>{currentList === LIST_TYPES.ONLINE ? 'Spesa Online' : 'Supermercato'}</span>
            </h3>

            {curItems.length === 0 ? (
              <p style={{opacity:.8}}>Nessun prodotto ancora</p>
            ) : (
              <div style={styles.listGrid}>
                {curItems.map((it) => (
                  <div key={it.id} style={styles.itemRow}>
                    <div style={styles.itemMain}>
                      <div style={styles.qtyBadge}>{it.qty}</div>
                      <div>
                        <div style={styles.itemName}>{it.name}</div>
                        <div style={styles.itemBrand}>{it.brand || '—'}</div>
                        <div style={{fontSize:12, opacity:.85, marginTop:4}}>
                          Unità/conf.: <b>{it.unitsPerPack}</b> {it.unitLabel}
                        </div>
                      </div>
                    </div>
                    <div style={styles.itemActions}>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        <span style={{fontSize:12, opacity:.85}}>Unità/conf.</span>
                        <button title="−1 unità/conf." onClick={() => incItemUnitsPerPack(it.id, -1)} style={styles.actionGhost}>−</button>
                        <button title="+1 unità/conf." onClick={() => incItemUnitsPerPack(it.id, +1)} style={styles.actionGhost}>＋</button>
                        <select
                          value={it.unitLabel || 'unità'}
                          onChange={(e)=>setItemUnitLabel(it.id, e.target.value)}
                          style={{...styles.input, minWidth:120, padding:'6px 8px'}}
                        >
                          <option value="unità">unità</option>
                          <option value="bottiglie">bottiglie</option>
                          <option value="vasetti">vasetti</option>
                          <option value="uova">uova</option>
                          <option value="barrette">barrette</option>
                          <option value="pz">pz</option>
                        </select>
                      </div>

                      <button
                        title="Segna 1 acquistato (trasferisce confezioni e unità/conf. in Scorte)"
                        onClick={() => markBought(it.id, 1)}
                        style={it.purchased ? styles.actionSuccess : styles.actionDanger}
                      >
                        {it.purchased ? '✔ Comprato 1' : 'Comprato 1'}
                      </button>

                      {Number(it.qty) > 1 && (
                        <button
                          title="Segna tutta la quantità come acquistata"
                          onClick={() => markBought(it.id, Number(it.qty))}
                          style={styles.actionSuccess}
                        >
                          ✅ Comprato tutto
                        </button>
                      )}

                      <div style={{display:'flex', gap:6}}>
                        <button title="Diminuisci quantità (confezioni)" onClick={() => incQty(it.id, -1)} style={styles.actionGhost}>−</button>
                        <button title="Aumenta quantità (confezioni)" onClick={() => incQty(it.id, +1)} style={styles.actionGhost}>＋</button>
                      </div>
                      <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.actionGhostDanger}>🗑 Elimina</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form aggiunta manuale */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>Aggiungi prodotto</h3>
            <form onSubmit={addManualItem} style={styles.formRow}>
              <input placeholder="Prodotto (es. latte)" value={form.name}
                     onChange={e => setForm(f => ({...f, name: e.target.value}))} style={styles.input} required />
              <input placeholder="Marca (es. Parmalat)" value={form.brand}
                     onChange={e => setForm(f => ({...f, brand: e.target.value}))} style={styles.input} />
              <input placeholder="Confezioni" inputMode="decimal" value={form.qty}
                     onChange={e => setForm(f => ({...f, qty: e.target.value}))} style={{...styles.input, width: 140}} required />
              <input placeholder="Unità/conf. (es. 6)" inputMode="decimal" value={form.unitsPerPack}
                     onChange={e => setForm(f => ({...f, unitsPerPack: e.target.value}))} style={{...styles.input, width: 160}} required />
              <select
                value={form.unitLabel}
                onChange={(e)=>setForm(f=>({...f, unitLabel: e.target.value}))}
                style={{...styles.input, minWidth:140, padding:'10px 12px'}}
              >
                <option value="unità">unità</option>
                <option value="bottiglie">bottiglie</option>
                <option value="vasetti">vasetti</option>
                <option value="uova">uova</option>
                <option value="barrette">barrette</option>
                <option value="pz">pz</option>
              </select>
              <button style={styles.primaryBtn} disabled={busy}>Aggiungi alla lista</button>
            </form>
            <p style={{opacity:.8, marginTop: 6}}>
              Esempio: “latte Parmalat — Confezioni 1 — Unità/conf. 6 — Etichetta bottiglie”.
            </p>
          </div>

          {/* Prodotti in esaurimento / scadenza */}
          <div style={styles.sectionXL}>
            <h3 style={styles.h3}>📦 Prodotti in esaurimento / scadenza</h3>
            {critical.length === 0 ? (
              <p style={{opacity:.8}}>Nessun prodotto critico</p>
            ) : (
              <ul style={{margin:'6px 0 0', paddingLeft: '18px'}}>
                {critical.map((p, i) => (
                  <li key={i}>
                    {p.name} {p.brand ? `(${p.brand})` : ''} — {p.packs} conf. × {p.unitsPerPack} {p.unitLabel} = {totalUnitsOf(p)} unità
                    {p.expiresAt ?  ` — Scadenza: ${new Date(p.expiresAt).toLocaleDateString('it-IT')}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stato scorte */}
          <div style={styles.sectionXL}>
            <div style={styles.scorteHeader}>
              <h3 style={{...styles.h3, marginBottom:0}}>📊 Stato Scorte</h3>
              <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                {!invRecBusy ? (
                  <button onClick={toggleVoiceInventory} style={styles.voiceBtnSmall} disabled={busy}>🎙 Vocale Scadenze/Scorte</button>
                ) : (
                  <button onClick={toggleVoiceInventory} style={styles.voiceBtnSmallStop}>⏹️ Stop</button>
                )}
                <button onClick={() => ocrInputRef.current?.click()} style={styles.ocrBtnSmall} disabled={busy}>📷 OCR Scontrini</button>
                <input
                  ref={ocrInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  multiple
                  hidden
                  onChange={(e) => handleOCR(Array.from(e.target.files || []))}
                />
              </div>
            </div>

            {stock.length === 0 ? (
              <p style={{opacity:.8, marginTop:8}}>Nessun dato scorte</p>
            ) : (
              <table style={{...styles.table, marginTop:10}}>
                <thead>
                  <tr>
                    <th style={styles.th}>Prodotto</th>
                    <th style={styles.th}>Marca</th>
                    <th style={styles.th}>Confezioni</th>
                    <th style={styles.th}>Unità/conf.</th>
                    <th style={styles.th}>Tot. unità</th>
                    <th style={styles.th}>Scadenza</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{s.name}</td>
                      <td style={styles.td}>{s.brand || '-'}</td>

                      {/* Confezioni: inline controls */}
                      <td style={styles.td}>
                        <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                          <button title="−1 conf." onClick={()=>adjustStockPacks(i, -1)} style={styles.actionGhost}>−</button>
                          <div style={{minWidth:60, textAlign:'center', fontWeight:700}}>{(s.packs ?? 0).toFixed?.(2) ?? s.packs ?? '-'}</div>
                          <button title="+1 conf." onClick={()=>adjustStockPacks(i, +1)} style={styles.actionGhost}>＋</button>
                          <button title="Imposta confezioni…" onClick={()=> {
                            const v = prompt('Imposta confezioni:', String(s.packs ?? 0));
                            if (v!=null) setStockPacks(i, v);
                          }} style={styles.actionGhost}>✎</button>
                        </div>
                      </td>

                      {/* Unità per confezione: inline controls */}
                      <td style={styles.td}>
                        <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                          <div style={{minWidth:40, textAlign:'center', fontWeight:700}}>{(s.unitsPerPack ?? 1)}</div>
                          <button title="Imposta unità/conf.…" onClick={()=>{
                            const v = prompt('Unità per confezione:', String(s.unitsPerPack ?? 1));
                            if (v!=null) setStockUnitsPerPack(i, v);
                          }} style={styles.actionGhost}>✎</button>
                          <span style={{opacity:.8}}>{s.unitLabel || 'unità'}</span>
                        </div>
                      </td>

                      {/* Totale unità con aggiustamenti ±1 */}
                      <td style={styles.td}>
                        <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                          <button title="−1 unità" onClick={()=>adjustStockUnits(i, -1)} style={styles.actionGhost}>−</button>
                          <div style={{minWidth:60, textAlign:'center', fontWeight:800}}>{totalUnitsOf(s)}</div>
                          <button title="+1 unità" onClick={()=>adjustStockUnits(i, +1)} style={styles.actionGhost}>＋</button>
                        </div>
                      </td>

                      <td style={styles.td}>{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('it-IT') : '-'}</td>
                      <td style={styles.td}>
                        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                          <button onClick={()=>openRowOcr(i)} style={styles.ocrInlineBtn} disabled={busy}>📷 OCR</button>
                          <button onClick={()=>editStockRow(i)} style={styles.actionGhost}>✎ Modifica</button>
                          <button onClick={()=>deleteStockRow(i)} style={styles.actionGhostDanger}>🗑 Elimina</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* input file unico per OCR scadenza di riga */}
            <input
              ref={rowOcrInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              hidden
              onChange={(e)=>handleRowOcrChange(Array.from(e.target.files||[]))}
            />
            <p style={{opacity:.75, marginTop:8}}>
              Esempi scadenze: “il latte scade il 15/07/2025; lo yogurt il 10 agosto 2025”.
            </p>
            <p style={{opacity:.75, marginTop:4}}>
              Esempi scorte: “latte sono 3 bottiglie, pasta 4 pacchi, ferrero fiesta 3 unità”.
              Per impostare il totale invece di aggiungere: “latte <b>porta a</b> 3 bottiglie”.
            </p>
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
              background: toast.type==='ok' ? '#16a34a' : (toast.type==='err' ? '#ef4444' : '#334155'),
              color:'#fff', padding:'10px 14px', borderRadius:10, boxShadow:'0 6px 16px rgba(0,0,0,.35)', zIndex:9999
            }}>
              {toast.msg}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Piccolo workaround per evitare warning su più MediaRecorder in certi browser */
function theMediaWorkaround(){}

/* ---------------- styles ---------------- */
const styles = {
  page: {
    width: '100%', minHeight: '100vh', background: '#0f172a',
    padding: 34, display: 'flex', alignItems: 'center', justifyContent:'center', color:'#fff',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  },
  card: { width:'100%', maxWidth: 1000, background:'rgba(0,0,0,.6)', borderRadius: 16, padding: 26, boxShadow: '0 6px 16px rgba(0,0,0,.3)' },
  headerRow: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 },
  homeBtn: { background:'#6366f1', color:'#fff', padding:'8px 12px', borderRadius:10, textDecoration:'none' },

  switchRow: { display:'flex', gap:12, margin: '18px 0 12px' },
  switchBtn: { background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer' },
  switchBtnActive: { background:'#06b6d4', border:'0', color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },

  toolsRow: { display:'flex', flexWrap:'wrap', gap:12, margin:'14px 0 6px' },

  voiceBtn: { background:'#6366f1', border:0, color:'#fff', padding:'10px 14px', borderRadius:12, cursor:'pointer', fontWeight:800 },

  sectionLarge: { marginTop: 36, marginBottom: 10 },
  sectionXL: { marginTop: 46, marginBottom: 12 },
  h3: { margin:'6px 0 14px' },

  listGrid: { display:'flex', flexDirection:'column', gap:14 },
  itemRow: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.12)',
    borderRadius:12, padding:'10px 12px'
  },
  itemMain: { display:'flex', alignItems:'center', gap:12 },
  qtyBadge: { minWidth:36, height:36, borderRadius:12, background:'rgba(99,102,241,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800 },
  itemName: { fontSize:16, fontWeight:700 },
  itemBrand: { fontSize:12, opacity:.8 },

  itemActions: { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'flex-end' },
  actionSuccess: { background:'#16a34a', border:0, color:'#fff', padding:'8px 10px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  actionDanger: { background:'#ef4444', border:0, color:'#fff', padding:'8px 10px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  actionGhost: { background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  actionGhostDanger: { background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.6)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },

  formRow: { display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' },
  input: {
    padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.06)', color: '#fff', minWidth: 200
  },
  primaryBtn: { background:'#16a34a', border:0, color:'#fff', padding:'10px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },

  table: { width:'100%', borderCollapse:'collapse', background:'rgba(255,255,255,.04)', borderRadius:12, overflow:'hidden' },
  th: { textAlign:'left', padding:'10px', borderBottom:'1px solid rgba(255,255,255,.12)' },
  td: { padding:'10px', borderBottom:'1px solid rgba(255,255,255,.08)' },

  scorteHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  voiceBtnSmall: { background:'#6366f1', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  voiceBtnSmallStop: { background:'#ef4444', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  ocrBtnSmall: { background:'#06b6d4', border:0, color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  ocrInlineBtn: { background:'rgba(6,182,212,.15)', border:'1px solid rgba(6,182,212,.6)', color:'#e0fbff', padding:'6px 10px', borderRadius:10, cursor:'pointer', fontWeight:700 }
};
