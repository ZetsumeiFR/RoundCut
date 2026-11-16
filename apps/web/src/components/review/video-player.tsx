"use client";

import { type FrameRate, formatTimecode } from "@roundcut/api/timecode";
import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@roundcut/ui/components/dialog";
import { Kbd, KbdGroup } from "@roundcut/ui/components/kbd";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import { Slider } from "@roundcut/ui/components/slider";
import { Spinner } from "@roundcut/ui/components/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roundcut/ui/components/tooltip";
import { cn } from "@roundcut/ui/lib/utils";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  KeyboardIcon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import {
  createContext,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { formatMessage, type Messages } from "@/i18n/messages";

type PlayerMessages = Messages["projects"]["player"];

// In full screen only the player's subtree is visible: popups portal into it.
const PortalContainer = createContext<
  RefObject<HTMLDivElement | null> | undefined
>(undefined);

// A timestamped point on the timeline: a feedback comment once REV-03 ships.
export interface PlayerMarker {
  id: string;
  label: string;
  timeMs: number;
}

export const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

// Versions uploaded before VER-03 have no declared rate.
export const FALLBACK_FRAME_RATE: FrameRate = 25;
export const MS_PER_SECOND = 1000;
export const SEEK_SECONDS = 1;
// Absorbs float noise so a position exactly on a frame boundary reads as that
// frame, not the one before.
const FRAME_EPSILON = 1e-6;
// Seeking to the middle of a frame makes every browser decode that frame
// rather than its neighbour.
export const MID_FRAME = 0.5;

export const frameAt = (seconds: number, frameRate: number) =>
  Math.floor(seconds * frameRate + FRAME_EPSILON);

export const isPlaybackRate = (value: number): value is PlaybackRate =>
  PLAYBACK_RATES.some((rate) => rate === value);

const TEXT_INPUT =
  "input:not([type=range]), textarea, select, [contenteditable]";
const ACTIVATABLE = "button, a, [role=button], [role=option], [role=menuitem]";
const SLIDER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

// Keys the player leaves to the focused element: typing, the native slider
// keys on the timeline, and Space/Enter on buttons and links.
// Space is matched on its physical code: some layouts and input methods
// report it with an empty or composed `key`.
export function shortcutKey(event: KeyboardEvent) {
  if (event.code === "Space") {
    return " ";
  }
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function belongsToTarget(event: KeyboardEvent, key: string) {
  const { target } = event;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(TEXT_INPUT) || target.closest("[role=dialog]")) {
    return true;
  }
  if (target.matches("input[type=range]") && SLIDER_KEYS.has(key)) {
    return true;
  }
  return (
    (key === " " || key === "Enter") && target.closest(ACTIVATABLE) !== null
  );
}

interface PlayerActions {
  changeRate: (direction: -1 | 1) => void;
  jumpToMarker: (direction: -1 | 1) => void;
  openShortcuts: () => void;
  seekBy: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  stepFrame: (direction: -1 | 1) => void;
  toggleFullscreen: () => void;
  toggleMute: () => void;
  togglePlay: () => void;
}

function runShortcut(
  event: KeyboardEvent,
  key: string,
  actions: PlayerActions
) {
  const handlers: Record<string, () => void> = {
    " ": actions.togglePlay,
    "?": actions.openShortcuts,
    "<": () => actions.changeRate(-1),
    ">": () => actions.changeRate(1),
    ArrowDown: () => actions.jumpToMarker(1),
    ArrowLeft: () =>
      event.shiftKey ? actions.seekBy(-SEEK_SECONDS) : actions.stepFrame(-1),
    ArrowRight: () =>
      event.shiftKey ? actions.seekBy(SEEK_SECONDS) : actions.stepFrame(1),
    ArrowUp: () => actions.jumpToMarker(-1),
    End: () => actions.seekTo(Number.POSITIVE_INFINITY),
    f: actions.toggleFullscreen,
    Home: () => actions.seekTo(0),
    k: actions.togglePlay,
    m: actions.toggleMute,
  };
  const handler = handlers[key];
  if (!handler) {
    return;
  }
  event.preventDefault();
  handler();
}

export function ControlButton({
  children,
  label,
  onClick,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent container={use(PortalContainer)}>{label}</TooltipContent>
    </Tooltip>
  );
}

function MarkerButton({
  durationMs,
  frameRate,
  marker,
  messages,
  onSeek,
}: {
  durationMs: number;
  frameRate: FrameRate;
  marker: PlayerMarker;
  messages: PlayerMessages;
  onSeek: (seconds: number) => void;
}) {
  const handleClick = useCallback(
    () => onSeek(marker.timeMs / MS_PER_SECOND),
    [marker.timeMs, onSeek]
  );
  const label = formatMessage(messages.controls.marker, {
    label: marker.label,
    timecode: formatTimecode(marker.timeMs, frameRate),
  });
  const position = Math.min(Math.max(marker.timeMs / durationMs, 0), 1);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={label}
            className="absolute top-0 size-2.5 -translate-x-1/2 rotate-45 bg-warning outline-none ring-ring/50 transition-colors hover:bg-warning/80 focus-visible:ring-2"
            onClick={handleClick}
            style={{ left: `${position * 100}%` }}
            type="button"
          />
        }
      />
      <TooltipContent container={use(PortalContainer)}>{label}</TooltipContent>
    </Tooltip>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm">{label}</dt>
      <dd>
        <KbdGroup>
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      </dd>
    </div>
  );
}

function ShortcutsDialog({
  container,
  messages,
  onOpenChange,
  open,
}: {
  container: RefObject<HTMLDivElement | null> | undefined;
  messages: PlayerMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { shortcuts } = messages;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md" container={container}>
        <DialogHeader>
          <DialogTitle>{shortcuts.title}</DialogTitle>
          <DialogDescription>{shortcuts.description}</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col divide-y">
          <ShortcutRow
            keys={[shortcuts.space, "K"]}
            label={shortcuts.playPause}
          />
          <ShortcutRow keys={["←", "→"]} label={shortcuts.step} />
          <ShortcutRow keys={["⇧ ←", "⇧ →"]} label={shortcuts.second} />
          <ShortcutRow keys={["<", ">"]} label={shortcuts.speed} />
          <ShortcutRow keys={["↑", "↓"]} label={shortcuts.marker} />
          <ShortcutRow keys={["Home", "End"]} label={shortcuts.startEnd} />
          <ShortcutRow keys={["F"]} label={shortcuts.fullscreen} />
          <ShortcutRow keys={["M"]} label={shortcuts.mute} />
          <ShortcutRow keys={["?"]} label={shortcuts.help} />
        </dl>
      </DialogContent>
    </Dialog>
  );
}

export function RateSelect({
  label,
  locale,
  onRateChange,
  rate,
}: {
  label: string;
  locale: Locale;
  onRateChange: (value: string | null) => void;
  rate: PlaybackRate;
}) {
  const rateLabel = useMemo(() => {
    const format = new Intl.NumberFormat(locale);
    return (value: number) => `${format.format(value)}×`;
  }, [locale]);
  return (
    <Select onValueChange={onRateChange} value={String(rate)}>
      <SelectTrigger aria-label={label} className="w-20" size="sm">
        <SelectValue>{rateLabel(rate)}</SelectValue>
      </SelectTrigger>
      <SelectContent container={use(PortalContainer)}>
        <SelectGroup>
          {PLAYBACK_RATES.map((value) => (
            <SelectItem key={value} value={String(value)}>
              {rateLabel(value)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function PlayerOptions({
  controls,
  fullscreen,
  locale,
  muted,
  onOpenShortcuts,
  onRateChange,
  onToggleFullscreen,
  onToggleMute,
  rate,
}: {
  controls: PlayerMessages["controls"];
  fullscreen: boolean;
  locale: Locale;
  muted: boolean;
  onOpenShortcuts: () => void;
  onRateChange: (value: string | null) => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  rate: PlaybackRate;
}) {
  return (
    <div className="ms-auto flex items-center gap-1">
      <RateSelect
        label={controls.speed}
        locale={locale}
        onRateChange={onRateChange}
        rate={rate}
      />
      <ControlButton
        label={muted ? controls.unmute : controls.mute}
        onClick={onToggleMute}
        pressed={muted}
      >
        {muted ? (
          <VolumeXIcon aria-hidden="true" />
        ) : (
          <Volume2Icon aria-hidden="true" />
        )}
      </ControlButton>
      <ControlButton label={controls.shortcuts} onClick={onOpenShortcuts}>
        <KeyboardIcon aria-hidden="true" />
      </ControlButton>
      <ControlButton
        label={fullscreen ? controls.exitFullscreen : controls.enterFullscreen}
        onClick={onToggleFullscreen}
      >
        {fullscreen ? (
          <MinimizeIcon aria-hidden="true" />
        ) : (
          <MaximizeIcon aria-hidden="true" />
        )}
      </ControlButton>
    </div>
  );
}

export function VideoError({
  messages,
  onRetry,
}: {
  messages: PlayerMessages;
  onRetry: () => void;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-white"
      role="alert"
    >
      <CircleAlertIcon aria-hidden="true" className="size-6" />
      <p className="font-medium text-sm">{messages.videoError.title}</p>
      <p className="max-w-sm text-white/70 text-xs">
        {messages.videoError.description}
      </p>
      <Button onClick={onRetry} size="sm" type="button" variant="secondary">
        {messages.videoError.action}
      </Button>
    </div>
  );
}

export function VideoPlayer({
  durationMs: declaredDurationMs,
  frameRate: declaredFrameRate,
  locale,
  markers,
  messages,
  onSourceError,
  poster,
  src,
}: {
  durationMs: number | null;
  frameRate: FrameRate | null;
  locale: Locale;
  markers: PlayerMarker[];
  messages: PlayerMessages;
  // The signed URL expired or the file failed: fetch a fresh URL.
  onSourceError: () => void;
  // The version's thumbnail (VER-06), shown until playback starts.
  poster: string | null;
  src: string;
}) {
  const frameRate = declaredFrameRate ?? FALLBACK_FRAME_RATE;
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeAt = useRef(0);
  const [time, setTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const duration =
    mediaDuration === null
      ? (declaredDurationMs ?? 0) / MS_PER_SECOND
      : mediaDuration;
  const { controls } = messages;

  // Smooth timecode while playing; paused positions come from `seeked`.
  useEffect(() => {
    if (!playing) {
      return;
    }
    let frame = 0;
    const tick = () => {
      if (videoRef.current) {
        setTime(videoRef.current.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const sync = () =>
      setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (src) {
      setFailed(false);
      setLoading(true);
    }
  }, [src]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const end = Number.isFinite(video.duration) ? video.duration : 0;
    const target = Math.min(Math.max(seconds, 0), end);
    video.currentTime = target;
    setTime(target);
  }, []);

  const seekBy = useCallback(
    (seconds: number) => seekTo((videoRef.current?.currentTime ?? 0) + seconds),
    [seekTo]
  );

  const stepFrame = useCallback(
    (direction: -1 | 1) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      video.pause();
      const lastFrame = Math.max(Math.ceil(video.duration * frameRate) - 1, 0);
      const frame = Math.min(
        Math.max(frameAt(video.currentTime, frameRate) + direction, 0),
        lastFrame
      );
      seekTo((frame + MID_FRAME) / frameRate);
    },
    [frameRate, seekTo]
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused || video.ended) {
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setMuted(video.muted);
    }
  }, []);

  const applyRate = useCallback((next: PlaybackRate) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = next;
    }
    setRate(next);
  }, []);

  const changeRate = useCallback(
    (direction: -1 | 1) => {
      const index = PLAYBACK_RATES.indexOf(rate) + direction;
      const next = PLAYBACK_RATES[index];
      if (next !== undefined) {
        applyRate(next);
      }
    },
    [applyRate, rate]
  );

  const handleRateChange = useCallback(
    (value: string | null) => {
      const next = Number(value);
      if (isPlaybackRate(next)) {
        applyRate(next);
      }
    },
    [applyRate]
  );

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      container.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.timeMs - b.timeMs),
    [markers]
  );

  const jumpToMarker = useCallback(
    (direction: -1 | 1) => {
      const currentMs = (videoRef.current?.currentTime ?? 0) * MS_PER_SECOND;
      // Half a frame of slack so a marker under the playhead isn't picked again.
      const slackMs = (MID_FRAME * MS_PER_SECOND) / frameRate;
      const target =
        direction > 0
          ? sortedMarkers.find((marker) => marker.timeMs > currentMs + slackMs)
          : sortedMarkers.findLast(
              (marker) => marker.timeMs < currentMs - slackMs
            );
      if (target) {
        videoRef.current?.pause();
        seekTo(target.timeMs / MS_PER_SECOND);
      }
    },
    [frameRate, seekTo, sortedMarkers]
  );

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  const actions = useRef<PlayerActions>(null);
  actions.current = {
    changeRate,
    jumpToMarker,
    openShortcuts,
    seekBy,
    seekTo,
    stepFrame,
    toggleFullscreen,
    toggleMute,
    togglePlay,
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = shortcutKey(event);
      const modified = event.metaKey || event.ctrlKey || event.altKey;
      if (
        event.defaultPrevented ||
        modified ||
        !actions.current ||
        belongsToTarget(event, key)
      ) {
        return;
      }
      runShortcut(event, key, actions.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      setMediaDuration(video.duration);
      video.playbackRate = rate;
      if (resumeAt.current > 0) {
        video.currentTime = resumeAt.current;
      }
      setLoading(false);
    },
    [rate]
  );

  const handleError = useCallback(() => {
    resumeAt.current = videoRef.current?.currentTime ?? 0;
    setLoading(false);
    setFailed(true);
    setPlaying(false);
  }, []);

  const handleSeeked = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) =>
      setTime(event.currentTarget.currentTime),
    []
  );
  const handlePlay = useCallback(() => setPlaying(true), []);
  const handlePause = useCallback(() => {
    setPlaying(false);
    setTime(videoRef.current?.currentTime ?? 0);
  }, []);
  const handleWaiting = useCallback(() => setLoading(true), []);
  const handleCanPlay = useCallback(() => setLoading(false), []);

  const handleSliderChange = useCallback(
    (value: number | readonly number[]) =>
      seekTo(typeof value === "number" ? value : (value[0] ?? 0)),
    [seekTo]
  );

  const timecodeOf = useCallback(
    (seconds: number) => formatTimecode(seconds * MS_PER_SECOND, frameRate),
    [frameRate]
  );
  const getTimelineLabel = useCallback(
    () => controls.timeline,
    [controls.timeline]
  );
  const getTimelineValueText = useCallback(
    (_formatted: string, value: number) => timecodeOf(value),
    [timecodeOf]
  );
  const stepBack = useCallback(() => stepFrame(-1), [stepFrame]);
  const stepForward = useCallback(() => stepFrame(1), [stepFrame]);

  const durationMs = duration * MS_PER_SECOND;
  const portalContainer = fullscreen ? containerRef : undefined;

  return (
    <PortalContainer value={portalContainer}>
      <div
        className={cn(
          "flex min-w-0 flex-col bg-black",
          fullscreen && "h-full w-full justify-center"
        )}
        data-fullscreen={fullscreen || undefined}
        ref={containerRef}
      >
        <div className={cn("relative min-h-0", fullscreen && "flex-1")}>
          <video
            className={cn(
              "block w-full bg-black object-contain",
              fullscreen ? "h-full" : "aspect-video"
            )}
            onCanPlay={handleCanPlay}
            onClick={togglePlay}
            onEnded={handlePause}
            onError={handleError}
            onLoadedMetadata={handleLoadedMetadata}
            onPause={handlePause}
            onPlay={handlePlay}
            onSeeked={handleSeeked}
            onWaiting={handleWaiting}
            playsInline
            poster={poster ?? undefined}
            preload="auto"
            ref={videoRef}
            src={src}
          >
            <track kind="captions" />
          </video>
          {loading && !failed ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Spinner className="size-6 text-white" />
            </div>
          ) : null}
          {failed ? (
            <VideoError messages={messages} onRetry={onSourceError} />
          ) : null}
        </div>
        <div className="flex flex-col gap-2 bg-background px-3 pt-3 pb-2">
          <div>
            {sortedMarkers.length > 0 && durationMs > 0 ? (
              <div className="relative mx-1.5 mb-1 h-2.5">
                {sortedMarkers.map((marker) => (
                  <MarkerButton
                    durationMs={durationMs}
                    frameRate={frameRate}
                    key={marker.id}
                    marker={marker}
                    messages={messages}
                    onSeek={seekTo}
                  />
                ))}
              </div>
            ) : null}
            <Slider
              disabled={duration <= 0 || failed}
              getAriaLabel={getTimelineLabel}
              getAriaValueText={getTimelineValueText}
              max={duration > 0 ? duration : 1}
              min={0}
              onValueChange={handleSliderChange}
              step={1 / frameRate}
              value={Math.min(time, duration)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <ControlButton label={controls.previousFrame} onClick={stepBack}>
              <ChevronLeftIcon aria-hidden="true" />
            </ControlButton>
            <ControlButton
              label={playing ? controls.pause : controls.play}
              onClick={togglePlay}
            >
              {playing ? (
                <PauseIcon aria-hidden="true" />
              ) : (
                <PlayIcon aria-hidden="true" />
              )}
            </ControlButton>
            <ControlButton label={controls.nextFrame} onClick={stepForward}>
              <ChevronRightIcon aria-hidden="true" />
            </ControlButton>
            <p className="ms-2 font-mono text-xs tabular-nums">
              <span aria-live="off" data-testid="player-timecode">
                {timecodeOf(time)}
              </span>
              <span className="text-muted-foreground">
                {" / "}
                {timecodeOf(duration)}
              </span>
            </p>
            <PlayerOptions
              controls={controls}
              fullscreen={fullscreen}
              locale={locale}
              muted={muted}
              onOpenShortcuts={openShortcuts}
              onRateChange={handleRateChange}
              onToggleFullscreen={toggleFullscreen}
              onToggleMute={toggleMute}
              rate={rate}
            />
          </div>
        </div>
        <ShortcutsDialog
          container={portalContainer}
          messages={messages}
          onOpenChange={setShortcutsOpen}
          open={shortcutsOpen}
        />
      </div>
    </PortalContainer>
  );
}
