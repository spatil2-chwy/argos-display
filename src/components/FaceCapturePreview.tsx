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
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-8 text-white">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
        <div className="flex min-h-[52vh] items-center justify-center overflow-hidden rounded-lg border border-white/12 bg-black">
          <img
            alt={title}
            className="max-h-[78vh] w-full object-contain"
            src={imageUrl}
          />
        </div>

        <aside className="flex flex-col gap-5 rounded-lg border border-white/12 bg-white/8 p-5 shadow-2xl backdrop-blur-md">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
            {decision && (
              <p className="mt-2 text-sm font-medium text-white/68">
                {decision === 'accept' ? 'Accepted' : 'Rejected'}
              </p>
            )}
            {error && (
              <p className="mt-2 text-sm font-medium text-red-300">{error}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              className="h-14 rounded-lg bg-emerald-500 px-4 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40 disabled:text-emerald-950/50"
              disabled={hasDecision}
              onClick={() => onDecision('accept')}
              type="button"
            >
              {acceptLabel}
            </button>
            <button
              className="h-14 rounded-lg border border-white/18 bg-white/10 px-4 text-base font-semibold text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:text-white/40"
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
