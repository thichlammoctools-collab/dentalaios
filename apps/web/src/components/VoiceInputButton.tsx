import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "idle" | "recording" | "processing";

interface VoiceInputButtonProps {
  onTranscription: (text: string) => void;
  onTranscriptChange?: (text: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
}

export function VoiceInputButton({
  onTranscription,
  onTranscriptChange,
  onRecordingChange,
  disabled,
  variant = "outline",
  size = "sm",
  className,
  label = "Ghi âm",
}: VoiceInputButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const latestTranscriptRef = useRef("");
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "vi-VN";

    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalTranscriptRef.current += `${finalTranscriptRef.current ? " " : ""}${text.trim()}`;
        } else {
          interimTranscript += text;
        }
      }
      const transcript = `${finalTranscriptRef.current}${interimTranscript ? `${finalTranscriptRef.current ? " " : ""}${interimTranscript.trim()}` : ""}`.trim();
      latestTranscriptRef.current = transcript;
      setError(null);
      onTranscriptChange?.(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" && !recordingRef.current) {
        return;
      }
      if (event.error === "no-speech") return;
      setError(event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        recordingRef.current = false;
        setStatus("idle");
        onRecordingChange?.(false);
      }
    };

    recognition.onend = () => {
      if (!recordingRef.current) {
        setStatus("idle");
        return;
      }

      // Chrome can end a continuous recognition session after silence. Restart it
      // while the clinician's recording session is still active.
      restartTimerRef.current = setTimeout(() => {
        try {
          recognition.start();
        } catch {
          // An in-flight restart can throw; the following onend cycle retries it.
        }
      }, 200);
    };

    recognitionRef.current = recognition;

    return () => {
      recordingRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognition.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClick() {
    if (status === "recording") {
      recordingRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognitionRef.current?.stop();
      setStatus("idle");
      onRecordingChange?.(false);
      onTranscription(latestTranscriptRef.current);
      return;
    }

    setError(null);
    finalTranscriptRef.current = "";
    latestTranscriptRef.current = "";
    recordingRef.current = true;
    setStatus("recording");
    onRecordingChange?.(true);
    try {
      recognitionRef.current?.start();
    } catch {
      recordingRef.current = false;
      setStatus("idle");
      onRecordingChange?.(false);
    }
  }

  if (!supported) return null;

  const icon = (() => {
    if (status === "processing") {
      return (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 000 20v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
        </svg>
      );
    }
    if (status === "recording") {
      return (
        <span className="flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
      );
    }
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    );
  })();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        status === "recording" && "ring-2 ring-red-400 ring-offset-1 bg-red-50 text-red-600 hover:bg-red-50 border-red-300",
        status === "idle" && "text-blue-600 border-blue-200 hover:bg-blue-50",
        className,
      )}
      title={error ?? (status === "recording" ? "Dừng ghi âm" : "Bắt đầu ghi âm")}
    >
      {icon}
      {label && <span>{status === "recording" ? "Dừng ghi âm" : label}</span>}
    </Button>
  );
}
