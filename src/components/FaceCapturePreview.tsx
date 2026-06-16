type FaceCaptureDecision = 'accept' | 'reject';

interface FaceCapturePreviewProps {
  imageUrl: string;
  title?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  decision: FaceCaptureDecision | null;
  error: string;
  onDecision: (decision: FaceCaptureDecision) => void;
}

export function FaceCapturePreview({
  imageUrl,
  title = 'Face Capture Preview',
  acceptLabel = 'Accept',
  rejectLabel = 'Reject',
  decision,
  error,
  onDecision,
}: FaceCapturePreviewProps) {
  const hasDecision = decision !== null;

  return (
    <div className="flex h-dvh min-h-0 items-center justify-center overflow-hidden bg-neutral-950 p-2 text-white sm:p-4">
      <div className="grid h-full min-h-0 w-full max-w-6xl grid-rows-[minmax(0,1fr)_auto] gap-2 sm:gap-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] md:grid-rows-1 md:items-stretch">
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-lg border border-white/12 bg-black">
          <img
            alt={title}
            className="h-full max-h-full w-full object-contain"
            src={imageUrl}
          />
        </div>

        <aside className="flex min-h-0 flex-col gap-2 rounded-lg border border-white/12 bg-white/8 p-2 shadow-2xl backdrop-blur-md sm:gap-4 sm:p-4 md:justify-center">
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight sm:text-xl md:text-2xl">{title}</h1>
            {decision && (
              <p className="mt-2 text-sm font-medium text-white/68">
                {decision === 'accept' ? 'Accepted' : 'Rejected'}
              </p>
            )}
            {error && (
              <p className="mt-2 text-sm font-medium text-red-300">{error}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-1">
            <button
              className="min-h-11 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40 disabled:text-emerald-950/50 sm:min-h-12 sm:px-4 sm:text-base"
              disabled={hasDecision}
              onClick={() => onDecision('accept')}
              type="button"
            >
              {acceptLabel}
            </button>
            <button
              className="min-h-11 rounded-lg border border-white/18 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:text-white/40 sm:min-h-12 sm:px-4 sm:text-base"
              disabled={hasDecision}
              onClick={() => onDecision('reject')}
              type="button"
            >
              {rejectLabel}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
