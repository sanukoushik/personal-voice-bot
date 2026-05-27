"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type RecognitionResultEvent = {
  resultIndex: number;
  results: {
    [index: number]: { isFinal: boolean; 0: { transcript: string } };
    length: number;
  };
};

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;

const SUGGESTED_QUESTIONS = [
  "What's your superpower?",
  "What drives you?",
  "How do you learn quickly?",
  "What misconception do people have about you?",
];

const initialMessage: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi, I'm Sanu. Ask me about how I think, learn, work, or handle unfamiliar challenges.",
};

const MAX_SPEECH_CHUNK_LENGTH = 200;

function splitForSpeech(text: string) {
  const cleanText = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let remaining = cleanText;

  while (remaining.length > MAX_SPEECH_CHUNK_LENGTH) {
    const window = remaining.slice(0, MAX_SPEECH_CHUNK_LENGTH + 1);
    const breakAt = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
      window.lastIndexOf(", "),
      window.lastIndexOf(" "),
    );
    const splitAt = breakAt > 0 ? breakAt + 1 : MAX_SPEECH_CHUNK_LENGTH;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function takeReadySpeech(text: string, flush = false) {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.trim()) {
    const sentenceEnd = remaining.match(/^[\s\S]*?[.!?](?=\s)/);
    if (sentenceEnd) {
      chunks.push(...splitForSpeech(sentenceEnd[0]));
      remaining = remaining.slice(sentenceEnd[0].length).trimStart();
      continue;
    }

    if (remaining.length >= MAX_SPEECH_CHUNK_LENGTH) {
      const window = remaining.slice(0, MAX_SPEECH_CHUNK_LENGTH + 1);
      const breakAt = Math.max(window.lastIndexOf(", "), window.lastIndexOf(" "));
      const splitAt = breakAt > 0 ? breakAt + 1 : MAX_SPEECH_CHUNK_LENGTH;
      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trimStart();
      continue;
    }

    if (flush) {
      chunks.push(...splitForSpeech(remaining));
      remaining = "";
    }
    break;
  }

  return { chunks, remaining };
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<Recognition | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelAudioRef = useRef<(() => void) | null>(null);
  const playbackTokenRef = useRef(0);
  const speechQueueRef = useRef<string[]>([]);
  const processingSpeechRef = useRef(false);
  const speechRequestRef = useRef<AbortController | null>(null);
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    setVoiceSupported(
      Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition),
    );
    return () => {
      recognitionRef.current?.stop();
      speechQueueRef.current = [];
      speechRequestRef.current?.abort();
      cancelAudioRef.current?.();
      audioRef.current?.pause();
      playbackTokenRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    const thread = threadRef.current;
    thread?.scrollTo({
      top: thread.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const stopSpeaking = () => {
    playbackTokenRef.current += 1;
    speechQueueRef.current = [];
    speechRequestRef.current?.abort();
    speechRequestRef.current = null;
    cancelAudioRef.current?.();
    cancelAudioRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  const speakWithBrowserVoice = (text: string, token: number) =>
    new Promise<void>((resolve) => {
      if (
        mutedRef.current ||
        token !== playbackTokenRef.current ||
        !("speechSynthesis" in window)
      ) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.97;
      utterance.pitch = 0.94;
      const voices = window.speechSynthesis.getVoices();
      utterance.voice =
        voices.find(
          (voice) =>
            voice.lang.startsWith("en") &&
            /(Daniel|David|James|Mark|Microsoft Ravi|Microsoft George|Google UK English Male|Male)/i.test(
              voice.name,
            ),
        ) ??
        voices.find(
          (voice) =>
            voice.lang.startsWith("en") &&
            /(Google|Microsoft|Natural)/i.test(voice.name) &&
            !/(Samantha|Zira|Female)/i.test(voice.name),
        ) ??
        voices.find((voice) => voice.lang.startsWith("en")) ??
        null;
      utterance.onstart = () => {
        if (token === playbackTokenRef.current) setIsSpeaking(true);
      };
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });

  const playSpeechChunk = async (text: string, token: number) => {
    if (mutedRef.current || token !== playbackTokenRef.current) return;

    const controller = new AbortController();
    speechRequestRef.current = controller;
    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Generated voice unavailable.");

      const url = URL.createObjectURL(await response.blob());
      if (mutedRef.current || token !== playbackTokenRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      try {
        await new Promise<void>((resolve, reject) => {
          cancelAudioRef.current = resolve;
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("Audio playback failed."));
          void audio.play().catch(reject);
        });
      } finally {
        cancelAudioRef.current = null;
        URL.revokeObjectURL(url);
      }
    } catch {
      if (controller.signal.aborted || token !== playbackTokenRef.current) return;
      await speakWithBrowserVoice(text, token);
    } finally {
      if (speechRequestRef.current === controller) speechRequestRef.current = null;
    }
  };

  const processSpeechQueue = async (token: number) => {
    if (processingSpeechRef.current) return;
    processingSpeechRef.current = true;
    try {
      while (
        token === playbackTokenRef.current &&
        !mutedRef.current &&
        speechQueueRef.current.length
      ) {
        const chunk = speechQueueRef.current.shift();
        if (!chunk) continue;
        setIsSpeaking(true);
        await playSpeechChunk(chunk, token);
      }
    } finally {
      processingSpeechRef.current = false;
      if (token === playbackTokenRef.current && !speechQueueRef.current.length) {
        setIsSpeaking(false);
      }
      if (speechQueueRef.current.length && !mutedRef.current) {
        void processSpeechQueue(playbackTokenRef.current);
      }
    }
  };

  const queueSpeech = (chunks: string[], token: number) => {
    if (mutedRef.current || token !== playbackTokenRef.current || !chunks.length) return;
    speechQueueRef.current.push(...chunks);
    void processSpeechQueue(token);
  };

  const ask = async (question: string) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isLoading) return;

    setError("");
    setDraft("");
    setIsLoading(true);
    stopSpeaking();
    const playbackToken = playbackTokenRef.current;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanQuestion,
    };
    const responseId = crypto.randomUUID();
    const priorMessages = messages.filter((message) => message.id !== "welcome");
    const nextHistory = [...priorMessages, userMessage];

    setMessages((current) => [
      ...current,
      userMessage,
      { id: responseId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextHistory }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Something went wrong. Please try again.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      let speechBuffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const delta = decoder.decode(value, { stream: true });
        answer += delta;
        speechBuffer += delta;
        const readySpeech = takeReadySpeech(speechBuffer);
        speechBuffer = readySpeech.remaining;
        queueSpeech(readySpeech.chunks, playbackToken);
        setMessages((current) =>
          current.map((message) =>
            message.id === responseId ? { ...message, content: answer } : message,
          ),
        );
      }

      if (!answer.trim()) throw new Error("I lost my train of thought. Could you ask again?");
      const finalSpeech = takeReadySpeech(speechBuffer, true);
      queueSpeech(finalSpeech.chunks, playbackToken);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Please try again.";
      setError(message);
      setMessages((current) => current.filter((item) => item.id !== responseId));
    } finally {
      setIsLoading(false);
    }
  };

  const startListening = () => {
    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input is not supported here. You can still type a question.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    let finalTranscript = "";
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      setDraft(`${finalTranscript}${interimTranscript}`.trim());
    };
    recognition.onerror = () => {
      setError("I couldn't hear that clearly. Try again or type your question.");
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (finalTranscript.trim()) void ask(finalTranscript);
    };

    setError("");
    setDraft("");
    setIsListening(true);
    recognition.start();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  const status = isListening
    ? "Listening"
    : isSpeaking
      ? "Speaking"
      : isLoading
        ? "Thinking"
        : "Ready";

  return (
    <main className="shell">
      <header className="intro">
        <div className="identity">
          <span className="avatar">S</span>
          <div>
            <p className="eyebrow">AI REPRESENTATION OF SANU</p>
            <p className="availability">
              <span className="online" /> Available for a conversation
            </p>
          </div>
        </div>
        <button
          type="button"
          className="sound-toggle"
          onClick={() => {
            setMuted((value) => !value);
            stopSpeaking();
          }}
          aria-label={muted ? "Enable voice responses" : "Mute voice responses"}
        >
          {muted ? "Voice off" : "Voice on"}
        </button>
      </header>

      <section className="hero">
        <p className="kicker">VOICE INTERVIEW</p>
        <h1>
          Talk to an AI
          <br />
          version of <span>me.</span>
        </h1>
        <p className="subtitle">
          Ask me anything about how I think, work, learn, and grow.
        </p>
      </section>

      <section className="conversation" aria-label="Conversation with Sanu">
        <div className="thread" ref={threadRef} aria-live="polite">
          {messages.map((message) => {
            const canCollapse = message.role === "assistant" && message.id !== "welcome";
            const isExpanded = expandedResponses.has(message.id);

            return (
              <article key={message.id} className={`bubble ${message.role}`}>
                <p className="speaker">{message.role === "assistant" ? "Sanu" : "You"}</p>
                {canCollapse ? (
                  <>
                    <button
                      type="button"
                      className="transcript-toggle"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedResponses((current) => {
                          const next = new Set(current);
                          if (next.has(message.id)) next.delete(message.id);
                          else next.add(message.id);
                          return next;
                        })
                      }
                    >
                      {isExpanded ? "Hide transcript" : "Show transcript"}
                    </button>
                    {isExpanded && (
                      <p className="transcript">
                        {message.content || <span className="typing">Thinking</span>}
                      </p>
                    )}
                  </>
                ) : (
                  <p>{message.content}</p>
                )}
              </article>
            );
          })}
        </div>

        <div className="suggestions" aria-label="Suggested questions">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              type="button"
              key={question}
              disabled={isLoading}
              onClick={() => void ask(question)}
            >
              {question}
            </button>
          ))}
        </div>

        <form className="composer" onSubmit={submit}>
          <button
            type="button"
            className={`microphone ${isListening ? "active" : ""}`}
            aria-label={isListening ? "Stop listening" : "Start speaking"}
            onClick={startListening}
            disabled={isLoading || !voiceSupported}
          >
            <span className="mic-icon" />
          </button>
          <label className="input-wrap">
            <span className="sr-only">Your question</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={isListening ? "I'm listening..." : "Ask Sanu a question"}
              disabled={isLoading}
            />
          </label>
          <button className="send" type="submit" disabled={isLoading || !draft.trim()}>
            Ask
          </button>
        </form>

        <div className="status" data-mode={status.toLowerCase()}>
          <span className="pulse" />
          {status}
          {!voiceSupported && " - type to chat in this browser"}
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
