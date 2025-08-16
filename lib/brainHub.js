// /components/VoiceRecorder.js
import React, { useEffect, useRef, useState } from 'react';

export default function VoiceRecorder({
  buttonClass = '',
  idleLabel = '🎤 Comando vocale',
  recordingLabel = '⏹ Stop',
  onText = () => {},
  disabled = false,
}) {
  const [recording, setRecording] = useState(false);
  const streamRef = useRef(null);
  const recogRef = useRef(null); // Web Speech
  const chunksRef = useRef([]);
  const mediaRecRef = useRef(null);

  // chiude TUTTE le tracce microfono
  const stopTracks = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    } catch {}
  };
  const stopRecognition = () => {
    try {
      if (recogRef.current) {
        recogRef.current.onresult = null;
        recogRef.current.onerror = null;
        recogRef.current.onend = null;
        recogRef.current.stop();
        recogRef.current.abort?.();
        recogRef.current = null;
      }
    } catch {}
  };
  const stopMediaRecorder = () => {
    try {
      mediaRecRef.current?.stop();
      mediaRecRef.current = null;
      chunksRef.current = [];
    } catch {}
  };

  useEffect(() => {
    return () => { // cleanup on unmount
      stopRecognition();
      stopMediaRecorder();
      stopTracks();
    };
  }, []);

  const start = async () => {
    if (disabled || recording) return;
    setRecording(true);

    // 1) accendi mic per permesso/indicatori
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // prosegui comunque (solo Web Speech potrebbe bastare)
    }

    // 2) prova Web Speech (meglio per STT immediato)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR();
      recogRef.current = r;
      r.lang = 'it-IT';
      r.continuous = false;
      r.interimResults = false;

      r.onresult = (e) => {
        const txt = Array.from(e.results).map(res => res[0]?.transcript || '').join(' ').trim();
        if (txt) onText(txt);
      };
      r.onerror = () => {}; // ignora
      r.onend = () => {
        setRecording(false);
        stopTracks();
      };
      try { r.start(); } catch { /* già in start? */ }
      return;
    }

    // 3) fallback: registra audio (senza STT: chiama onText con stringa vuota)
    if (streamRef.current) {
      try {
        const mr = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
        mediaRecRef.current = mr;
        mr.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
        mr.onstop = () => {
          setRecording(false);
          stopTracks();
          // Fallback: qui potresti inviare il blob a un endpoint STT se ne hai uno.
          onText(''); // nessun testo riconosciuto in fallback
        };
        mr.start();
      } catch {
        // niente da fare
      }
    }
  };

  const stop = () => {
    if (!recording) return;
    setRecording(false);
    stopRecognition();
    stopMediaRecorder();
    stopTracks(); // <— questo spegne davvero il microfono
  };

  return (
    <button
      type="button"
      className={buttonClass}
      onClick={() => (recording ? stop() : start())}
      disabled={disabled}
      aria-pressed={recording}
      aria-label={recording ? 'Ferma registrazione' : 'Avvia comando vocale'}
    >
      {recording ? recordingLabel : idleLabel}
    </button>
  );
}
