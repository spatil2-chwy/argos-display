import { useEffect, useRef, useState } from 'react';

interface SubtitlesProps {
  text: string;
}

export function Subtitles({ text }: SubtitlesProps) {
  const [displayedText, setDisplayedText] = useState('');
  const displayedTextRef = useRef('');
  const targetTextRef = useRef('');
  const transcriptRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // Cumulative streaming updates keep the characters already revealed.
    const previousText = text.startsWith(targetTextRef.current)
      ? displayedTextRef.current
      : '';
    targetTextRef.current = text;
    displayedTextRef.current = previousText;
    setDisplayedText(previousText);

    const characters = Array.from(text);
    let currentIndex = Array.from(previousText).length;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const typeNextChar = () => {
      if (currentIndex >= characters.length) return;

      const character = characters[currentIndex++];
      displayedTextRef.current = characters.slice(0, currentIndex).join('');
      setDisplayedText(displayedTextRef.current);
      timeoutId = setTimeout(typeNextChar, /[.,!?;:]/.test(character) ? 150 : 50);
    };

    typeNextChar();
    return () => clearTimeout(timeoutId);
  }, [text]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [displayedText]);

  if (!text) return null;

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
