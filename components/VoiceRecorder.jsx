import React, { useState, useRef } from 'react';

export default function VoiceRecorder({
  onText,
  onError,
  buttonClass = '',
  idleLabel = '🎤 Voce',
  recordingLabel = '⏹ Stop',
}) {
  const [recBusy, setRecBusy] = useState(false);
  const mediaRecRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const toggleRec = async () => {
    if (recBusy) {
      mediaRecRef.current?.stop();
      setRecBusy(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mediaRecRef.current.ondataavailable = (e) => {
        if (e.data.size) recordedChunksRef.current.push(e.data);
      };
      mediaRecRef.current.onstop = processVoice;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch (err) {
      console.error(err);
      onError?.('Microfono non disponibile');
    }
  };

  const processVoice = async () => {
    const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
    const fd   = new FormData();
    fd.append('audio', blob, 'voice.webm');
    try {
      const { text } = await (
        await fetch('/api/stt', { method: 'POST', body: fd })
      ).json();
      if (text) onText?.(text);
    } catch (err) {
      console.error(err);
      onError?.('STT fallito');
    }
  };

  return (
    <button className={buttonClass} onClick={toggleRec}>
      {recBusy ? recordingLabel : idleLabel}
    </button>
  );
}
