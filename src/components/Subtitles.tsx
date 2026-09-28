import { useEffect, useRef, useState } from 'react';

interface SubtitlesProps {
  text: string;
  durationMs: number;
  startedAtMs: number;
  revision: number;
}

const PUNCTUATION_DELAY_MULTIPLIER = 3;
const REVEAL_COMPLETION_BUFFER_MS = 250;

function splitGraphemes(text: string) {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }

  return Array.from(text);
}

export function Subtitles({ text, durationMs, startedAtMs, revision }: SubtitlesProps) {
  const [displayedText, setDisplayedText] = useState('');
  const transcriptRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      return;
    }

    setDisplayedText('');
    const characters = splitGraphemes(text);
    const totalTimingUnits = characters.reduce(
      (total, character) => total + (/[.,!?;:]/.test(character) ? PUNCTUATION_DELAY_MULTIPLIER : 1),
      0,
    );
    const revealDurationMs = Math.max(0, durationMs - REVEAL_COMPLETION_BUFFER_MS);
    const revealStartedAtMs = startedAtMs || Date.now();
    let frameId: number | null = null;
    let lastCharacterCount = -1;

    const updateDisplayedText = () => {
      const elapsedMs = Math.max(0, Date.now() - revealStartedAtMs);
      const elapsedTimingUnits = revealDurationMs > 0
        ? Math.min(totalTimingUnits, (elapsedMs / revealDurationMs) * totalTimingUnits)
        : totalTimingUnits;
      let consumedTimingUnits = 0;
      let characterCount = 0;

      for (const character of characters) {
        if (characterCount > 0 && consumedTimingUnits > elapsedTimingUnits) break;
        characterCount++;
        consumedTimingUnits += /[.,!?;:]/.test(character) ? PUNCTUATION_DELAY_MULTIPLIER : 1;
      }

      if (characterCount !== lastCharacterCount) {
        lastCharacterCount = characterCount;
        setDisplayedText(characters.slice(0, characterCount).join(''));
      }

      if (characterCount < characters.length) {
        frameId = requestAnimationFrame(updateDisplayedText);
      }
    };

    updateDisplayedText();

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [text, durationMs, startedAtMs, revision]);

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
        className="h-[3.25em] max-w-4xl overflow-y-auto whitespace-pre-wrap break-words text-center text-2xl font-medium leading-relaxed tracking-wide text-white/95 md:text-3xl"
        ref={transcriptRef}
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.95)' }}
      >
        {displayedText}
      </p>
    </div>
  );
}
