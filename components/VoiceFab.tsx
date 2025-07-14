"use client";
import React, { useState, useRef, useEffect } from "react";
import { Mic, Square } from "lucide-react";

interface VoiceFabProps {
  /** Blob audio al termine della registrazione */
  onAudioReady?: (audio: Blob) => void;
  /** Callback a ogni toggle (true=rec) */
  onToggle?: (recording: boolean) => void;
  /** Avviare subito la registrazione? */
  initialRecording?: boolean;
  /** MIME desiderato per MediaRecorder */
  mimeType?: string;
}

export default function VoiceFab({
  onAudioReady,
  onToggle,
  initialRecording = false,
  mimeType = "audio/webm",
}: VoiceFabProps) {
  const [isRecording, setIsRecording] = useState(initialRecording);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  /** Avvia MediaRecorder */
  const startRecording = async () => {
    if (mediaRecorderRef.current) return; // già attivo
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });

      streamRef.current = stream;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onAudioReady?.(blob);
        // stop microfono
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        streamRef.current = null;
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      console.log("MediaRecorder started");
    } catch (err) {
      console.error("getUserMedia error", err);
      setIsRecording(false);
      onToggle?.(false);
    }
  };

  /** Ferma MediaRecorder */
  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      console.log("MediaRecorder stopping…");
    }
  };

  /** Effetto side‑effect su isRecording */
  useEffect(() => {
    onToggle?.(isRecording);
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // Cleanup se il componente viene smontato ancora in registrazione
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  const handleClick = () => setIsRecording((prev) => !prev);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`rounded-full h-16 w-16 flex items-center justify-center text-white shadow-lg transition-colors focus:outline-none focus:ring-4 ${
        isRecording
          ? "bg-red-600 focus:ring-red-300 animate-pulse"
          : "bg-emerald-600 focus:ring-emerald-300"
      }`}
      aria-label={isRecording ? "Ferma registrazione" : "Avvia registrazione"}
      role="switch"
      aria-checked={isRecording}
    >
      {isRecording ? (
        <Square className="h-8 w-8" aria-hidden="true" />
      ) : (
        <Mic className="h-8 w-8" aria-hidden="true" />
      )}
    </button>
  );
}
