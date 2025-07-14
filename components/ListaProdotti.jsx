import React, { useState } from 'react';

const ListaProdotti = ({ lista = 'supermercato' }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!input) return;
    setLoading(true);
    await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        func: 'aggiungiProdotto',
        args: { testo: input, lista }
      })
    });
    setInput('');
    setLoading(false);
    // TODO: refresh list
  };

  const handleVoice = async () => {
    // TODO: implement voice recording and send to /api/agent with func 'vocale'
    alert('Voice recognition placeholder');
  };

  const handleOCR = async () => {
    // TODO: implement OCR upload and send to /api/agent with func 'ocr'
    alert('OCR placeholder');
  };

  return (
    <div className="spese-box">
      <h2>Lista {lista === 'online' ? 'Spesa Online' : 'Supermercato'}</h2>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Aggiungi manualmente..."
      />
      <div className="spese-buttons">
        <button onClick={handleAdd} disabled={loading}>Aggiungi</button>
        <button onClick={handleVoice}>Vocale</button>
        <button onClick={handleOCR}>OCR</button>
      </div>
    </div>
  );
};

export default ListaProdotti;
