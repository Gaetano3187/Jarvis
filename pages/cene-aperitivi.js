// pages/cene-aperitivi.js
import React, { useEffect, useState, useRef } from 'react'
import Head  from 'next/head'
import Link  from 'next/link'
import withAuth        from '../hoc/withAuth'
import { supabase }    from '../lib/supabaseClient'
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
#ENDPA
import { parseAssistant } from '@/lib/assistant';

function CeneAperitivi () {
  /* ------------------- state ------------------- */
  const [spese,      setSpese]      = useState([])
  const [nuovaSpesa, setNuovaSpesa] = useState({ descrizione: '', importo: '' })
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  /* OCR file-input nascosto */
  const fileInputRef = useRef(null)

  /* ------------------- fetch iniziale ------------------- */
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

  /* ------------------- CRUD ------------------- */
  const handleAdd = async (e) => {
    e.preventDefault()
    const { data, error } = await supabase
      .from('finances')
      .insert([{ ...nuovaSpesa, categoria: 'divertimento' }])
      .select()
      .single()

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

  /* ------------------- OCR & Voce ------------------- */
  const handleOCR = async file => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const prompt = 'Analizza lo scontrino OCR e restituisci JSON con {descrizione, importo, esercizio, data}.'
      await parseAssistant(`${prompt}\n${base64}`)
    }
    reader.readAsDataURL(file)
  }

  const handleVoice = async () => {
    const spoken = prompt('Parla o digita la descrizione:')
    if (!spoken) return
    const prompt = `Estrai descrizione, importo e data da: "${spoken}" in JSON`
    await parseAssistant(prompt)
  }

  const parseAssistant = async fullPrompt => {
  try {
    const answer = await askAssistant(fullPrompt);
    return JSON.parse(answer);
  } catch (err) {
    console.error(err);
    return null;
  }
}
}
