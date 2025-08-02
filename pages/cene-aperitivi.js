// pages/cene-aperitivi.js
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
  const [nuovaSpesa, setNuovaSpesa] = useState({ descrizione: '', importo: '' })
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  const fileInputRef = useRef(null)

  useEffect(() => { fetchSpese() }, [])

  const fetchSpese = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, date, finance_categories(name)')
      .eq('finance_categories.name', '"CENE"')
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
      date: new Date().toISOString(),
      qty: 1
    })

    if (!error) {
      setSpese([...spese, data])
      setNuovaSpesa({ descrizione: '', importo: '' })
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
      const prompt = 'Analizza lo scontrino OCR e restituisci JSON con {descrizione, importo, esercizio, data}.'
      const parsed = await parseAssistant(`${prompt}\n${base64}`)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !parsed) return
      await insertExpense({
        userId: user.id,
        categoryName: 'cene',
        description: parsed.descrizione || parsed.item || 'spesa',
        amount: Number(parsed.importo || parsed.prezzo || 0),
        date: parsed.data || new Date().toISOString(),
        qty: 1
      })
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
    await insertExpense({
      userId: user.id,
      categoryName: 'cene',
      description: parsed.descrizione || parsed.item || 'spesa',
      amount: Number(parsed.importo || parsed.prezzo || 0),
      date: parsed.data || new Date().toISOString(),
      qty: 1
    })
    fetchSpese()
  }

  return null
}

export default withAuth(CeneAperitivi)
