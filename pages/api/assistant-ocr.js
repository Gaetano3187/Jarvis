// components/AssistantOCRClient.js
import { useEffect, useState, useCallback } from 'react';

export default function AssistantOCRClient() {
  const [result, setResult] = useState(null);

  useEffect(() => {
    // fai qui eventuali fetch/inizializzazioni async
    // (mai durante il render)
  }, []);

  const handleOCR = useCallback(async (file) => {
    // qui la tua logica OCR async
    // es: const text = await runOCR(file);
    // setResult(text);
  }, []);

  return (
    <div>
      {/* la tua UI */}
      {/* usa handleOCR sugli input */}
      {result && <pre>{result}</pre>}
    </div>
  );
}
