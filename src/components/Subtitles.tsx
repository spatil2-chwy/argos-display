import { useEffect, useRef } from 'react';

interface SubtitlesProps {
  text: string;
}

export function Subtitles({ text }: SubtitlesProps) {
  const transcriptRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [text]);

  if (!text) return null;

  return (
    <div className="fixed bottom-8 left-0 right-0 flex justify-center z-40 pointer-events-none px-4">
      <p
        className="h-[3.25em] max-w-4xl overflow-y-auto whitespace-pre-wrap break-words text-center text-2xl font-medium leading-relaxed tracking-wide text-white/95 md:text-3xl"
        ref={transcriptRef}
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.95)' }}
      >
        {text}
      </p>
    </div>
  );
}
