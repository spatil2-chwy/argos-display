import { useCallback, useEffect, useRef, useState } from 'react';
import Rive from '@rive-app/react-canvas';
import { CountdownTimer } from './components/CountdownTimer';
import { FaceCapturePreview, ImageMessagePreview } from './components/FaceCapturePreview';
import { Subtitles } from './components/Subtitles';
import { getEnvVar } from './utils/env';

import ThinkAnimation from './animations/face/Think.riv';
import ConfusedAnimation from './animations/face/Confused.riv';
import CuriousAnimation from './animations/face/Curious.riv';
import ExcitedAnimation from './animations/face/Excited.riv';
import HappyAnimation from './animations/face/Happy.riv';
import SadAnimation from './animations/face/Sad.riv';

const BUILT_IN_ANIMATIONS = {
  confused: ConfusedAnimation,
  curious: CuriousAnimation,
  excited: ExcitedAnimation,
  happy: HappyAnimation,
  sad: SadAnimation,
  think: ThinkAnimation,
} as const;

const ANIMATION_STATES = Object.keys(BUILT_IN_ANIMATIONS) as AnimationState[];

type AnimationState = keyof typeof BUILT_IN_ANIMATIONS;
type DisplayMode = 'face' | 'rive' | 'message' | 'faceCapturePreview' | 'imageMessagePreview';
type FaceCaptureDecision = 'accept' | 'reject';

type FaceCapturePreviewState = {
  imageUrl: string;
  requestId?: string;
  title?: string;
  acceptLabel?: string;
  rejectLabel?: string;
};

type ImageMessagePreviewState = {
  imageUrl: string;
  title?: string;
  message: string;
};

type LiveImageState = {
  imageUrl: string;
  title?: string;
  cacheKey?: string;
  ttlMs: number;
};

type DisplayCommand = {
  type?: string;
  id?: string;
  requestId?: string;
  face?: string;
  animation?: string;
  state?: string;
  url?: string;
  src?: string;
  riveUrl?: string;
  imageUrl?: string;
  image?: string;
  dataUrl?: string;
  title?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  text?: string;
  message?: string;
  visible?: boolean;
  ttlMs?: number;
  refreshMs?: number;
  seconds?: number;
  value?: number;
  durationMs?: number;
  receivedAt?: string;
};

type ArgosManifestResponse = {
  defaultBasePath?: string;
};

type TimeoutId = ReturnType<typeof setTimeout>;
type IntervalId = ReturnType<typeof setInterval>;

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

function normalizeResourceBasePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return '';

  const normalized = `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return normalized === '/' ? '' : normalized;
}

function getControlApiUrl() {
  const configuredUrl = getEnvVar('VITE_CONTROL_API_URL');
  if (configuredUrl) return configuredUrl;

  if (typeof window === 'undefined') {
    return 'http://localhost:6124';
  }

  if (window.location.port === '5173') {
    return 'http://localhost:6124';
  }

  return window.location.origin;
}

function getConfiguredControlResourceBasePath() {
  return normalizeResourceBasePath(getEnvVar('VITE_ARGOS_RESOURCE_BASE_PATH'));
}

function getControlEndpointUrl(endpoint: string, resourceBasePath: string) {
  const normalizedEndpoint = endpoint.replace(/^\/+/, '');
  const path = resourceBasePath
    ? `${normalizeResourceBasePath(resourceBasePath)}/${normalizedEndpoint}`
    : `/${normalizedEndpoint}`;

  return `${normalizeBaseUrl(getControlApiUrl())}${path}`;
}

async function resolveControlResourceBasePath() {
  const configuredPath = getConfiguredControlResourceBasePath();
  if (configuredPath) return configuredPath;

  try {
    const response = await fetch(`${normalizeBaseUrl(getControlApiUrl())}/argos/manifest`);
    if (!response.ok) return '';

    const manifest = await response.json() as ArgosManifestResponse;
    return manifest.defaultBasePath ? normalizeResourceBasePath(manifest.defaultBasePath) : '';
  } catch {
    return '';
  }
}

function isAnimationState(value: string): value is AnimationState {
  return ANIMATION_STATES.includes(value as AnimationState);
}

function getCommandKind(command: DisplayCommand) {
  return command.type?.toLowerCase();
}

function getRiveUrl(command: DisplayCommand) {
  return command.riveUrl || command.url || command.src;
}

function getImageUrl(command: DisplayCommand) {
  return command.imageUrl || command.image || command.dataUrl || command.url || command.src;
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <div className="fixed top-4 right-4 z-50 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white/80 shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
        <span>{connected ? 'Local control' : 'Control offline'}</span>
      </div>
    </div>
  );
}

function CenterMessage({ text }: { text: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-black px-8">
      <div className="max-w-5xl whitespace-pre-wrap break-words text-center text-5xl font-semibold leading-tight text-white md:text-7xl">
        {text}
      </div>
    </div>
  );
}

const DEFAULT_IMAGE_TTL_MS = 1000;

function addCacheBuster(url: string, token?: string) {
  if (!token || url.startsWith('data:') || url.startsWith('blob:')) return url;

  try {
    const nextUrl = new URL(url, window.location.href);
    nextUrl.searchParams.set('_argosImageTs', token);
    return nextUrl.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_argosImageTs=${token}`;
  }
}

function LiveImageDisplay({ image }: { image: LiveImageState | null }) {
  if (!image) return null;

  return (
    <div className="pointer-events-none fixed left-4 top-4 z-50 w-[20vw] min-w-40 max-w-96 overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl">
      <img
        alt={image.title || 'Live image feed'}
        className="aspect-video w-full bg-black object-contain"
        src={addCacheBuster(image.imageUrl, image.cacheKey)}
      />
      {image.title && (
        <div className="truncate border-t border-white/10 bg-black/78 px-2 py-1 text-xs font-medium text-white/78">
          {image.title}
        </div>
      )}
    </div>
  );
}

export function App() {
  const [controlConnected, setControlConnected] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('face');
  const [currentAnimation, setCurrentAnimation] = useState<AnimationState>('happy');
  const [customRiveUrl, setCustomRiveUrl] = useState('');
  const [messageText, setMessageText] = useState('');
  const [faceCapturePreview, setFaceCapturePreview] = useState<FaceCapturePreviewState | null>(null);
  const [imageMessagePreview, setImageMessagePreview] = useState<ImageMessagePreviewState | null>(null);
  const [faceCaptureDecision, setFaceCaptureDecision] = useState<FaceCaptureDecision | null>(null);
  const [faceCaptureSubmitting, setFaceCaptureSubmitting] = useState(false);
  const [faceCaptureError, setFaceCaptureError] = useState('');
  const [subtitleText, setSubtitleText] = useState('');
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [countdownTotalSeconds, setCountdownTotalSeconds] = useState(20);
  const [liveImage, setLiveImage] = useState<LiveImageState | null>(null);
  const [controlResourceBasePath, setControlResourceBasePath] = useState(getConfiguredControlResourceBasePath);

  const subtitleTimeoutRef = useRef<TimeoutId | null>(null);
  const countdownIntervalRef = useRef<IntervalId | null>(null);
  const countdownDismissRef = useRef<TimeoutId | null>(null);
  const countdownSecondsRef = useRef<number | null>(null);
  const liveImageTimeoutRef = useRef<TimeoutId | null>(null);

  const clearSubtitle = useCallback(() => {
    if (subtitleTimeoutRef.current) {
      clearTimeout(subtitleTimeoutRef.current);
      subtitleTimeoutRef.current = null;
    }
    setSubtitleText('');
  }, []);

  const showSubtitle = useCallback((text: string, durationMs = 5000) => {
    if (subtitleTimeoutRef.current) {
      clearTimeout(subtitleTimeoutRef.current);
    }

    setSubtitleText(text);
    subtitleTimeoutRef.current = setTimeout(() => {
      setSubtitleText('');
      subtitleTimeoutRef.current = null;
    }, durationMs);
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (countdownDismissRef.current) {
      clearTimeout(countdownDismissRef.current);
      countdownDismissRef.current = null;
    }
    countdownSecondsRef.current = null;
    setCountdownSeconds(null);
  }, []);

  const clearLiveImage = useCallback(() => {
    if (liveImageTimeoutRef.current) {
      clearTimeout(liveImageTimeoutRef.current);
      liveImageTimeoutRef.current = null;
    }
    setLiveImage(null);
  }, []);

  const showLiveImage = useCallback((command: DisplayCommand) => {
    const imageUrl = getImageUrl(command);
    if (!imageUrl) return;

    const requestedTtl = command.ttlMs ?? command.durationMs ?? command.refreshMs ?? DEFAULT_IMAGE_TTL_MS;
    const ttlMs = Number.isFinite(requestedTtl) ? Math.max(100, Math.floor(requestedTtl)) : DEFAULT_IMAGE_TTL_MS;
    const cacheKey = command.receivedAt || `${Date.now()}`;

    if (liveImageTimeoutRef.current) {
      clearTimeout(liveImageTimeoutRef.current);
    }

    setLiveImage({
      imageUrl,
      title: command.title,
      cacheKey,
      ttlMs,
    });

    liveImageTimeoutRef.current = setTimeout(() => {
      setLiveImage(null);
      liveImageTimeoutRef.current = null;
    }, ttlMs);
  }, []);

  const startCountdown = useCallback((seconds: number) => {
    clearCountdown();

    const targetSeconds = Math.max(0, Math.floor(seconds));
    setCountdownTotalSeconds(Math.max(1, targetSeconds));
    countdownSecondsRef.current = targetSeconds;
    setCountdownSeconds(targetSeconds);

    if (targetSeconds === 0) {
      countdownDismissRef.current = setTimeout(() => {
        countdownSecondsRef.current = null;
        setCountdownSeconds(null);
        countdownDismissRef.current = null;
      }, 5000);
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      if (countdownSecondsRef.current === null) return;

      countdownSecondsRef.current = Math.max(0, countdownSecondsRef.current - 1);
      setCountdownSeconds(countdownSecondsRef.current);

      if (countdownSecondsRef.current === 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        countdownDismissRef.current = setTimeout(() => {
          countdownSecondsRef.current = null;
          setCountdownSeconds(null);
          countdownDismissRef.current = null;
        }, 5000);
      }
    }, 1000);
  }, [clearCountdown]);

  const setFace = useCallback((face: string) => {
    const normalizedFace = face.toLowerCase();

    if (!isAnimationState(normalizedFace)) {
      console.warn(`Unknown face "${face}". Keeping the current animation.`);
      return;
    }

    setCurrentAnimation(normalizedFace);
    setCustomRiveUrl('');
    setDisplayMode('face');
  }, []);

  const resetDisplay = useCallback(() => {
    clearSubtitle();
    clearCountdown();
    setMessageText('');
    setFaceCapturePreview(null);
    setImageMessagePreview(null);
    setFaceCaptureDecision(null);
    setFaceCaptureSubmitting(false);
    setFaceCaptureError('');
    setCustomRiveUrl('');
    setCurrentAnimation('happy');
    clearLiveImage();
    setDisplayMode('face');
  }, [clearCountdown, clearLiveImage, clearSubtitle]);

  const sendFaceCaptureDecision = useCallback(async (decision: FaceCaptureDecision) => {
    if (!faceCapturePreview) return;

    setFaceCaptureError('');
    setFaceCaptureSubmitting(true);

    const payload = {
      type: 'face_capture_preview_response',
      requestId: faceCapturePreview.requestId,
      action: decision,
      accepted: decision === 'accept',
      imageUrl: faceCapturePreview.imageUrl,
      timestamp: new Date().toISOString(),
    };

    const responseUrl = getControlEndpointUrl('response', controlResourceBasePath);
    try {
      const response = await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Response failed with ${response.status}`);
      }
      setFaceCaptureDecision(decision);
      setFace(decision === 'accept' ? 'happy' : 'sad');
    } catch (error) {
      console.error('Unable to send face capture response:', error);
      setFaceCaptureError(
        `Unable to send ${decision} to ${responseUrl}. Check the display control server and try again.`,
      );
    } finally {
      setFaceCaptureSubmitting(false);
    }
  }, [controlResourceBasePath, faceCapturePreview, setFace]);

  const applyCommand = useCallback((command: DisplayCommand) => {
    const kind = getCommandKind(command);

    if (kind === 'reset') {
      resetDisplay();
      return;
    }

    if (kind === 'clear') {
      clearSubtitle();
      clearCountdown();
      setMessageText('');
      setFaceCapturePreview(null);
      setImageMessagePreview(null);
      setFaceCaptureDecision(null);
      setFaceCaptureError('');
      clearLiveImage();
      return;
    }

    if (
      kind === 'clear_image' ||
      kind === 'image_clear' ||
      kind === 'hide_image' ||
      kind === 'hide_live_image' ||
      (kind === 'image' && command.visible === false)
    ) {
      clearLiveImage();
      return;
    }

    if (kind === 'face' || kind === 'avatar' || command.face || command.animation || command.state) {
      const face = command.face || command.animation || command.state;
      if (face) setFace(face);
    }

    if (kind === 'rive' || kind === 'animation') {
      const riveUrl = getRiveUrl(command);
      if (riveUrl) {
        setCustomRiveUrl(riveUrl);
        setDisplayMode('rive');
      }
    }

    if (kind === 'subtitle' || kind === 'asr' || (command.text && !kind)) {
      if (command.text) {
        showSubtitle(command.text, command.durationMs);
      }
    }

    if (kind === 'message') {
      setMessageText(command.text || '');
      setDisplayMode('message');
    }

    if (
      kind === 'face_capture_preview' ||
      kind === 'facecapturepreview' ||
      kind === 'capture_preview' ||
      kind === 'image_preview' ||
      kind === 'preview'
    ) {
      const imageUrl = getImageUrl(command);
      if (imageUrl) {
        setFaceCapturePreview({
          imageUrl,
          requestId: command.requestId || command.id,
          title: command.title,
          acceptLabel: command.acceptLabel,
          rejectLabel: command.rejectLabel,
        });
        setFaceCaptureDecision(null);
        setFaceCaptureSubmitting(false);
        setFaceCaptureError('');
        setDisplayMode('faceCapturePreview');
      }
    }

    if (
      kind === 'image_message_preview' ||
      kind === 'imagemessagepreview' ||
      kind === 'preview_message' ||
      kind === 'message_preview' ||
      kind === 'face_message_preview' ||
      kind === 'face_preview_message'
    ) {
      const imageUrl = getImageUrl(command);
      const message = command.message || command.text;
      if (imageUrl && message) {
        setImageMessagePreview({
          imageUrl,
          title: command.title,
          message,
        });
        setFaceCapturePreview(null);
        setFaceCaptureDecision(null);
        setFaceCaptureError('');
        setDisplayMode('imageMessagePreview');
      }
    }

    if (
      kind === 'image' ||
      kind === 'live_image' ||
      kind === 'image_display' ||
      kind === 'camera' ||
      kind === 'video'
    ) {
      showLiveImage(command);
    }

    if (kind === 'countdown' || typeof command.seconds === 'number' || typeof command.value === 'number') {
      const seconds = command.seconds ?? command.value;
      if (typeof seconds === 'number') {
        startCountdown(seconds);
      }
    }
  }, [clearCountdown, clearLiveImage, clearSubtitle, resetDisplay, setFace, showLiveImage, showSubtitle, startCountdown]);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    async function connect() {
      const resourceBasePath = await resolveControlResourceBasePath();
      if (cancelled) return;

      setControlResourceBasePath(resourceBasePath);
      source = new EventSource(getControlEndpointUrl('events', resourceBasePath));

      source.onopen = () => {
        setControlConnected(true);
      };

      source.onerror = () => {
        setControlConnected(false);
      };

      source.addEventListener('display', (event) => {
        try {
          applyCommand(JSON.parse(event.data));
        } catch (error) {
          console.error('Unable to parse display command:', error);
        }
      });

      source.addEventListener('snapshot', (event) => {
        try {
          applyCommand(JSON.parse(event.data));
        } catch (error) {
          console.error('Unable to parse display snapshot:', error);
        }
      });

      source.addEventListener('image', (event) => {
        try {
          applyCommand(JSON.parse(event.data));
        } catch (error) {
          console.error('Unable to parse image command:', error);
        }
      });
    }

    connect();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [applyCommand]);

  useEffect(() => {
    return () => {
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (countdownDismissRef.current) clearTimeout(countdownDismissRef.current);
      if (liveImageTimeoutRef.current) clearTimeout(liveImageTimeoutRef.current);
    };
  }, []);

  const riveSource = displayMode === 'rive' ? customRiveUrl : BUILT_IN_ANIMATIONS[currentAnimation];

  return (
    <>
      {displayMode === 'faceCapturePreview' && faceCapturePreview ? (
        <FaceCapturePreview
          acceptLabel={faceCapturePreview.acceptLabel}
          decision={faceCaptureDecision}
          error={faceCaptureError}
          imageUrl={faceCapturePreview.imageUrl}
          onDecision={sendFaceCaptureDecision}
          rejectLabel={faceCapturePreview.rejectLabel}
          submitting={faceCaptureSubmitting}
          title={faceCapturePreview.title}
        />
      ) : displayMode === 'imageMessagePreview' && imageMessagePreview ? (
        <ImageMessagePreview
          imageUrl={imageMessagePreview.imageUrl}
          message={imageMessagePreview.message}
          title={imageMessagePreview.title}
        />
      ) : displayMode === 'message' ? (
        <CenterMessage text={messageText} />
      ) : (
        <div className="flex h-screen items-center justify-center bg-black">
          <Rive key={riveSource} src={riveSource} />
        </div>
      )}
      <StatusPill connected={controlConnected} />
      <LiveImageDisplay image={liveImage} />
      <CountdownTimer remainingSeconds={countdownSeconds} totalSeconds={countdownTotalSeconds} />
      <Subtitles text={subtitleText} />
    </>
  );
}

export default App;
