import React, { useEffect, useState, useRef } from 'react'
import Head  from 'next/head'
import Link  from 'next/link'
import withAuth        from '../hoc/withAuth'
import { supabase }    from '../lib/supabaseClient'
import { insertExpense } from "@/lib/dbHelpers";
import { askAssistant } from '../lib/assistant'

const parseAssistant = async prompt => {
  try {
    const answer = await askAssistant(prompt);
    return JSON.parse(answer);
  } catch (err) {
    console.error(err);
    return null;
  }
};

function CeneAperitivi () {
  const [spese,      setSpese]      = useState([])
  const [nuovaSpesa, setNuovaSpesa] = useState({ descrizione: '', importo: '', quantita: '1', spentAt: '' })
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  const fileInputRef = useRef(null)

  useEffect(() => { fetchSpese() }, [])

  const fetchSpese = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, spent_at, qty, finance_categories(name)')
      .eq('finance_categories.name', 'Cene / Aperitivi')
      .order('created_at', { ascending: false })

    if (!error) setSpese(data)
    else        setError(error.message)

    setLoading(false)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Sessione scaduta')
      return
    }

    const { data, error } = await insertExpense({
      userId: user.id,
      categoryName: 'cene',
      description: nuovaSpesa.descrizione,
      amount: Number(nuovaSpesa.importo),
      spentAt: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1
    })

    if (!error) {
      setSpese([...spese, data])
      setNuovaSpesa({ descrizione: '', importo: '', quantita: '1', spentAt: '' })
    } else setError(error.message)
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (!error) setSpese(spese.filter(s => s.id !== id))
    else        setError(error.message)
  }

  const handleOCR = async file => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const prompt = 'Analizza lo scontrino OCR e restituisci JSON con {descrizione, importo, esercizio, data, quantita}.'
      const parsed = await parseAssistant(`${prompt}\n${base64}`)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !parsed) return

      const rows = Array.isArray(parsed) ? parsed : [parsed]
      const insert = rows.map(r => ({
        userId: user.id,
        categoryName: 'cene',
        description: r.descrizione || r.item || 'spesa',
        amount: Number(r.importo || r.prezzo || 0),
        spent_at: r.data || new Date().toISOString(),
        qty: parseInt(r.quantita || r.qty || 1, 10)
      }))

      await supabase.from('finances').insert(insert)
      fetchSpese()
    }
    reader.readAsDataURL(file)
  }

  const handleVoice = async () => {
    const spoken = prompt('Parla o digita la descrizione:')
    if (!spoken) return
    const prompt = `Estrai descrizione, importo e data da: "${spoken}" in JSON`
    const parsed = await parseAssistant(prompt)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !parsed) return

    const rows = Array.isArray(parsed) ? parsed : [parsed]
    const insert = rows.map(r => ({
      userId: user.id,
      categoryName: 'cene',
      description: r.descrizione || r.item || 'spesa',
      amount: Number(r.importo || r.prezzo || 0),
      spent_at: r.data || new Date().toISOString(),
      qty: parseInt(r.quantita || r.qty || 1, 10)
    }))

    await supabase.from('finances').insert(insert)
    fetchSpese()
  }

  const totale = spese.reduce(
    (sum, s) => sum + Number(s.amount || 0) * (s.qty ?? 1),
    0
  )

  return (
    <>
      <Head><title>Cene e Aperitivi</title></Head>

      <div className="cene-container">
        <h2>Cene e Aperitivi</h2>

        <form onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Descrizione"
            value={nuovaSpesa.descrizione}
            onChange={e => setNuovaSpesa({ ...nuovaSpesa, descrizione: e.target.value })}
            required
          />
          <input
            type="number"
            step="0.01"
            placeholder="Importo"
            value={nuovaSpesa.importo}
            onChange={e => setNuovaSpesa({ ...nuovaSpesa, importo: e.target.value })}
            required
          />
          <input
            type="number"
            step="1"
            min="1"
            placeholder="Quantità"
            value={nuovaSpesa.quantita}
            onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })}
            required
          />
          <input
            type="date"
            value={nuovaSpesa.spentAt}
            onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
          />
          <button type="submit">Aggiungi</button>
        </form>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => handleOCR(e.target.files[0])}
        />

        <button onClick={handleVoice}>🎙 Voce</button>
        <button onClick={() => fileInputRef.current?.click()}>📷 OCR</button>

        {loading ? (
          <p>Caricamento…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Descrizione</th>
                <th>Data</th>
                <th>Qtà</th>
                <th>Importo €</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {spese.map(s => (
                <tr key={s.id}>
                  <td>{s.description}</td>
                  <td>{s.spent_at ? new Date(s.spent_at).toLocaleDateString() : '-'}</td>
                  <td>{s.qty ?? 1}</td>
                  <td>{Number(s.amount).toFixed(2)}</td>
                  <td><button onClick={() => handleDelete(s.id)}>🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="total-box">Totale: € {totale.toFixed(2)}</div>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <Link href="/home">🏠 Home</Link>
      </div>
    </>
  )
}

export default withAuth(CeneAperitivi)