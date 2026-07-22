"use client";

import { useEffect, useRef, useState } from "react";
import { MdMic, MdMicOff } from "react-icons/md";

type SpeechRecognitionConstructor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string; confidence: number };
    }>;
  }) => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export default function SpeechTestPage() {
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [message, setMessage] = useState("Nospied mikrofonu un sāc runāt.");

  useEffect(() => {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(Boolean(Recognition));

    return () => recognitionRef.current?.abort();
  }, []);

  const startListening = () => {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      setMessage("Šis pārlūks neatbalsta balss atpazīšanu.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "lv-LV";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
      setMessage("Klausos… Runā latviski.");
    };

    recognition.onresult = (event) => {
      let finalPart = "";
      let interimPart = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalPart += transcript;
          setConfidence(Math.round(result[0].confidence * 100));
        } else {
          interimPart += transcript;
        }
      }

      if (finalPart.trim()) {
        setText((current) =>
          `${current}${current.trim() ? " " : ""}${finalPart.trim()}`,
        );
      }
      setInterimText(interimPart);
    };

    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        "not-allowed": "Nav dota mikrofona atļauja.",
        "no-speech": "Runa netika sadzirdēta. Mēģini vēlreiz.",
        network: "Balss atpazīšanai neizdevās pieslēgties tīklam.",
        "audio-capture": "Mikrofons nav pieejams.",
      };
      setMessage(messages[event.error] || `Atpazīšanas kļūda: ${event.error}`);
    };

    recognition.onend = () => {
      setListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => recognitionRef.current?.stop();

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 text-black dark:text-white">
      <div>
        <h1 className="text-xl font-semibold">Balss ievades tests</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Atpazīšanas valoda: latviešu (lv-LV)
        </p>
      </div>

      {supported === false ? (
        <div className="rounded border border-red-400 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          Šis pārlūks neatbalsta Web Speech balss atpazīšanu. Pamēģini Chrome, Edge vai Safari.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${
                listening
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-cyan-600 hover:bg-cyan-700"
              }`}
              aria-label={listening ? "Apturēt klausīšanos" : "Sākt klausīšanos"}
            >
              {listening ? <MdMicOff size={30} /> : <MdMic size={30} />}
            </button>
            <div>
              <div className="font-medium">{message}</div>
              {confidence !== null && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Pēdējā rezultāta pārliecība: {confidence}%
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea
              rows={8}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Atpazītais teksts parādīsies šeit…"
              className="w-full resize-y rounded border bg-white p-3 text-black dark:bg-zinc-800 dark:text-white"
            />
            {interimText && (
              <div className="mt-2 text-sm italic text-gray-500 dark:text-gray-400">
                Klausos: {interimText}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setText("");
              setInterimText("");
              setConfidence(null);
            }}
            className="rounded bg-gray-200 px-4 py-2 text-sm text-black hover:bg-gray-300 dark:bg-zinc-700 dark:text-white dark:hover:bg-zinc-600"
          >
            Notīrīt tekstu
          </button>
        </>
      )}
    </main>
  );
}
