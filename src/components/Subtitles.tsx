import { useState, useEffect } from 'react';

interface SubtitlesProps {
  text: string;
  position?: 'top' | 'bottom';
}

export function Subtitles({ text, position = 'bottom' }: SubtitlesProps) {
  const [displayedText, setDisplayedText] = useState('');

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

        let delay = 50;
        if (isPunctuation) delay = 150;

        timeoutId = setTimeout(typeNextChar, delay);
      }
    };
    
    typeNextChar();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [text]);

  if (!text && !displayedText) return null;

  return (
    <div
      className={`fixed ${position === 'top' ? 'top-8' : 'bottom-8'} left-0 right-0 z-40 flex justify-center px-4 pointer-events-none`}
    >
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
        <p className="text-white/95 text-center text-2xl md:text-3xl font-medium leading-relaxed tracking-wide">
          {displayedText}
        </p>
      </div>
    </div>
  );
}
