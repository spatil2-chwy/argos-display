import { useEffect, useRef, useState } from 'react';

interface SubtitlesProps {
  text: string;
}

export function Subtitles({ text }: SubtitlesProps) {
  const [displayedText, setDisplayedText] = useState('');
  const transcriptRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      return;
    }

    setDisplayedText('');
    let currentIndex = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const typeNextChar = () => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;

        const currentChar = text[currentIndex - 1];
        const isPunctuation = /[.,!?;:]/.test(currentChar);
        timeoutId = setTimeout(typeNextChar, isPunctuation ? 150 : 50);
      }
    };

    typeNextChar();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [text]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [displayedText]);

  if (!text && !displayedText) return null;

  return (
    <div className="fixed bottom-8 left-0 right-0 flex justify-center z-40 pointer-events-none px-4">
      <p
        className="h-[3.25em] max-w-4xl overflow-hidden whitespace-pre-wrap break-words text-center text-2xl font-medium leading-relaxed tracking-wide text-white/95 md:text-3xl"
        ref={transcriptRef}
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.95)' }}
      >
        {displayedText}
      </p>
    </div>
  );
}
