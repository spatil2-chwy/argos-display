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
      <div
        className="max-w-4xl rounded-[20px] px-7 py-5"
        style={{
          background: 'linear-gradient(180deg, rgba(28,28,32,0.88), rgba(8,8,12,0.95))',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 50px rgba(255,255,255,0.1)',
        }}
      >
        <p
          className="h-[4.875rem] overflow-y-auto whitespace-pre-wrap break-words pr-1 text-center text-2xl font-medium leading-relaxed tracking-wide text-white/95 md:h-[6.09375rem] md:text-3xl"
          ref={transcriptRef}
        >
          {displayedText}
        </p>
      </div>
    </div>
  );
}
