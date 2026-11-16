"use client";

import { type FrameRate, formatTimecode } from "@roundcut/api/timecode";
import type { Locale } from "@roundcut/auth/locale";
import { Badge } from "@roundcut/ui/components/reui/badge";
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
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import {
  belongsToTarget,
  ControlButton,
  FALLBACK_FRAME_RATE,
  frameAt,
  isPlaybackRate,
  MID_FRAME,
  MS_PER_SECOND,
  PLAYBACK_RATES,
  type PlaybackRate,
  RateSelect,
  SEEK_SECONDS,
  shortcutKey,
  VideoError,
} from "./video-player";

type PlayerMessages = Messages["projects"]["player"];

export interface CompareSide {
  durationMs: number | null;
  frameRate: FrameRate | null;
  number: number;
  poster: string | null;
  src: string | undefined;
}

const SIDES = [0, 1] as const;
type Side = (typeof SIDES)[number];
type Pair<T> = [T, T];
const AUDIO_SOURCES = ["0", "1", "off"] as const;
type AudioSource = (typeof AUDIO_SOURCES)[number];

// Beyond this gap the following video is pulled back onto the leader: small
// enough to stay within a frame or two, large enough not to stutter.
const MAX_DRIFT_SECONDS = 0.08;

const mediaDuration = (video: HTMLVideoElement | null) =>
  video && Number.isFinite(video.duration) ? video.duration : 0;

const isAudioSource = (value: unknown): value is AudioSource =>
  AUDIO_SOURCES.some((source) => source === value);

const withSide = <T,>(pair: Pair<T>, side: Side, value: T): Pair<T> =>
  side === 0 ? [value, pair[1]] : [pair[0], value];

interface CompareActions {
  changeRate: (direction: -1 | 1) => void;
  seekBy: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  stepFrame: (direction: -1 | 1) => void;
  togglePlay: () => void;
}

function runCompareShortcut(
  event: KeyboardEvent,
  key: string,
  actions: CompareActions
) {
  const handlers: Record<string, () => void> = {
    " ": actions.togglePlay,
    "<": () => actions.changeRate(-1),
    ">": () => actions.changeRate(1),
    ArrowLeft: () =>
      event.shiftKey ? actions.seekBy(-SEEK_SECONDS) : actions.stepFrame(-1),
    ArrowRight: () =>
      event.shiftKey ? actions.seekBy(SEEK_SECONDS) : actions.stepFrame(1),
    End: () => actions.seekTo(Number.POSITIVE_INFINITY),
    Home: () => actions.seekTo(0),
    k: actions.togglePlay,
  };
  const handler = handlers[key];
  if (!handler) {
    return;
  }
  event.preventDefault();
  handler();
}

function CompareVideo({
  ended,
  failed,
  loading,
  messages,
  onCanPlay,
  onError,
  onLoadedMetadata,
  onRetry,
  onWaiting,
  side,
  sideIndex,
  title,
  videoRef,
}: {
  ended: boolean;
  failed: boolean;
  loading: boolean;
  messages: PlayerMessages;
  onCanPlay: (side: Side) => void;
  onError: (side: Side) => void;
  onLoadedMetadata: (side: Side) => void;
  onRetry: (side: Side) => void;
  onWaiting: (side: Side) => void;
  side: CompareSide;
  sideIndex: Side;
  title: ReactNode;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const handleCanPlay = useCallback(
    () => onCanPlay(sideIndex),
    [onCanPlay, sideIndex]
  );
  const handleError = useCallback(
    () => onError(sideIndex),
    [onError, sideIndex]
  );
  const handleLoadedMetadata = useCallback(
    () => onLoadedMetadata(sideIndex),
    [onLoadedMetadata, sideIndex]
  );
  const handleRetry = useCallback(
    () => onRetry(sideIndex),
    [onRetry, sideIndex]
  );
  const handleWaiting = useCallback(
    () => onWaiting(sideIndex),
    [onWaiting, sideIndex]
  );

  return (
    <figure className="flex min-w-0 flex-col bg-background">
      <figcaption className="flex min-w-0 items-center gap-2 px-3 py-2">
        {title}
      </figcaption>
      <div className="relative bg-black">
        {side.src ? (
          <video
            aria-label={formatMessage(messages.version, {
              number: side.number,
            })}
            className="block aspect-video w-full bg-black object-contain"
            data-side={sideIndex}
            onCanPlay={handleCanPlay}
            onError={handleError}
            onLoadedMetadata={handleLoadedMetadata}
            onWaiting={handleWaiting}
            playsInline
            poster={side.poster ?? undefined}
            preload="auto"
            ref={videoRef}
            src={side.src}
          >
            <track kind="captions" />
          </video>
        ) : (
          <div className="aspect-video w-full" />
        )}
        {(loading || !side.src) && !failed ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner className="size-6 text-white" />
          </div>
        ) : null}
        {ended && !failed ? (
          <p className="absolute end-2 bottom-2 rounded-sm bg-black/70 px-2 py-1 text-white text-xs">
            {formatMessage(messages.compare.ended, { number: side.number })}
          </p>
        ) : null}
        {failed ? (
          <VideoError messages={messages} onRetry={handleRetry} />
        ) : null}
      </div>
    </figure>
  );
}

// Two versions played as one (VER-08): a single transport drives both videos
// at the same timecode. The longer video leads; the other follows and holds
// its last frame once it has ended.
export function ComparePlayer({
  locale,
  messages,
  onSourceError,
  sides,
  titles,
}: {
  locale: Locale;
  messages: PlayerMessages;
  // The signed URL expired or the file failed: fetch a fresh URL.
  onSourceError: (side: Side) => void;
  sides: Pair<CompareSide>;
  titles: Pair<ReactNode>;
}) {
  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [durations, setDurations] = useState<Pair<number | null>>([null, null]);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [audio, setAudio] = useState<AudioSource>("1");
  const [loading, setLoading] = useState<Pair<boolean>>([true, true]);
  const [failed, setFailed] = useState<Pair<boolean>>([false, false]);
  const { compare, controls } = messages;

  const durationOf = (side: Side) =>
    durations[side] ?? (sides[side].durationMs ?? 0) / MS_PER_SECOND;
  const leader: Side = durationOf(1) >= durationOf(0) ? 1 : 0;
  const duration = durationOf(leader);
  const frameRate = sides[leader].frameRate ?? FALLBACK_FRAME_RATE;

  const leaderRef = useRef(leader);
  leaderRef.current = leader;
  const timeRef = useRef(time);
  timeRef.current = time;

  const videos = useCallback(
    (): Pair<HTMLVideoElement | null> => [leftRef.current, rightRef.current],
    []
  );

  const seekTo = useCallback(
    (seconds: number) => {
      const all = videos();
      const end = Math.max(...all.map(mediaDuration));
      const target = Math.min(Math.max(seconds, 0), end);
      for (const video of all) {
        if (video) {
          video.currentTime = Math.min(target, mediaDuration(video));
        }
      }
      setTime(target);
    },
    [videos]
  );

  const pause = useCallback(() => {
    const all = videos();
    for (const video of all) {
      video?.pause();
    }
    setPlaying(false);
    // Realign on the leader's exact position so both show the same frame.
    seekTo(all[leaderRef.current]?.currentTime ?? 0);
  }, [seekTo, videos]);

  const play = useCallback(() => {
    const all = videos();
    const lead = all[leaderRef.current];
    if (!lead) {
      return;
    }
    if (lead.ended || lead.currentTime >= mediaDuration(lead)) {
      seekTo(0);
    }
    for (const video of all) {
      if (video && video.currentTime < mediaDuration(video)) {
        video.play().catch(() => pause());
      }
    }
    setPlaying(true);
  }, [pause, seekTo, videos]);

  const togglePlay = useCallback(() => {
    if (playing) {
      pause();
    } else {
      play();
    }
  }, [pause, play, playing]);

  // The leader's clock drives the timecode; the follower is pulled back when
  // it drifts (buffering, decoding hiccups).
  useEffect(() => {
    if (!playing) {
      return;
    }
    let frame = 0;
    const tick = () => {
      const all = videos();
      const lead = all[leaderRef.current];
      const follower = all[leaderRef.current === 1 ? 0 : 1];
      if (!lead) {
        return;
      }
      if (lead.ended) {
        pause();
        return;
      }
      const now = lead.currentTime;
      setTime(now);
      if (
        follower &&
        !follower.seeking &&
        now < mediaDuration(follower) &&
        Math.abs(follower.currentTime - now) > MAX_DRIFT_SECONDS
      ) {
        follower.currentTime = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pause, playing, videos]);

  // Two soundtracks at once are noise: only the chosen side is heard.
  useEffect(() => {
    for (const [side, video] of videos().entries()) {
      if (video) {
        video.muted = audio !== String(side);
      }
    }
  }, [audio, videos]);

  const seekBy = useCallback(
    (seconds: number) =>
      seekTo((videos()[leaderRef.current]?.currentTime ?? 0) + seconds),
    [seekTo, videos]
  );

  const stepFrame = useCallback(
    (direction: -1 | 1) => {
      const lead = videos()[leaderRef.current];
      if (!lead) {
        return;
      }
      pause();
      const lastFrame = Math.max(
        Math.ceil(mediaDuration(lead) * frameRate) - 1,
        0
      );
      const target = Math.min(
        Math.max(frameAt(lead.currentTime, frameRate) + direction, 0),
        lastFrame
      );
      seekTo((target + MID_FRAME) / frameRate);
    },
    [frameRate, pause, seekTo, videos]
  );

  const applyRate = useCallback(
    (next: PlaybackRate) => {
      for (const video of videos()) {
        if (video) {
          video.playbackRate = next;
        }
      }
      setRate(next);
    },
    [videos]
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

  const changeRate = useCallback(
    (direction: -1 | 1) => {
      const next = PLAYBACK_RATES[PLAYBACK_RATES.indexOf(rate) + direction];
      if (next !== undefined) {
        applyRate(next);
      }
    },
    [applyRate, rate]
  );

  const handleAudioChange = useCallback((value: unknown) => {
    if (isAudioSource(value)) {
      setAudio(value);
    }
  }, []);

  const actions = useRef<CompareActions>(null);
  actions.current = { changeRate, seekBy, seekTo, stepFrame, togglePlay };

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
      runCompareShortcut(event, key, actions.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLoadedMetadata = useCallback(
    (side: Side) => {
      const video = videos()[side];
      if (!video) {
        return;
      }
      video.playbackRate = rate;
      video.muted = audio !== String(side);
      setDurations((pair) => withSide(pair, side, mediaDuration(video)));
      setLoading((pair) => withSide(pair, side, false));
      // A refreshed URL resumes where the pair stands.
      video.currentTime = Math.min(timeRef.current, mediaDuration(video));
    },
    [audio, rate, videos]
  );
  const handleCanPlay = useCallback(
    (side: Side) => setLoading((pair) => withSide(pair, side, false)),
    []
  );
  const handleWaiting = useCallback(
    (side: Side) => setLoading((pair) => withSide(pair, side, true)),
    []
  );
  const handleError = useCallback(
    (side: Side) => {
      pause();
      setLoading((pair) => withSide(pair, side, false));
      setFailed((pair) => withSide(pair, side, true));
    },
    [pause]
  );
  const handleRetry = useCallback(
    (side: Side) => {
      setFailed((pair) => withSide(pair, side, false));
      setLoading((pair) => withSide(pair, side, true));
      onSourceError(side);
    },
    [onSourceError]
  );

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

  const audioLabel = (source: AudioSource) =>
    source === "off"
      ? compare.audio.off
      : formatMessage(compare.audio.version, {
          number: sides[source === "0" ? 0 : 1].number,
        });

  return (
    <div className="flex min-w-0 flex-col border">
      <div className="grid gap-px bg-border md:grid-cols-2">
        {SIDES.map((side) => (
          <CompareVideo
            ended={
              side !== leader &&
              durationOf(side) > 0 &&
              time >= durationOf(side)
            }
            failed={failed[side]}
            key={side}
            loading={loading[side]}
            messages={messages}
            onCanPlay={handleCanPlay}
            onError={handleError}
            onLoadedMetadata={handleLoadedMetadata}
            onRetry={handleRetry}
            onWaiting={handleWaiting}
            side={sides[side]}
            sideIndex={side}
            title={titles[side]}
            videoRef={side === 0 ? leftRef : rightRef}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t bg-background px-3 pt-3 pb-2">
        <Slider
          disabled={duration <= 0 || failed[0] || failed[1]}
          getAriaLabel={getTimelineLabel}
          getAriaValueText={getTimelineValueText}
          max={duration > 0 ? duration : 1}
          min={0}
          onValueChange={handleSliderChange}
          step={1 / frameRate}
          value={Math.min(time, duration)}
        />
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
            <span aria-live="off" data-testid="compare-timecode">
              {timecodeOf(time)}
            </span>
            <span className="text-muted-foreground">
              {" / "}
              {timecodeOf(duration)}
            </span>
          </p>
          <div className="ms-auto flex items-center gap-1">
            <Select onValueChange={handleAudioChange} value={audio}>
              <SelectTrigger
                aria-label={compare.audio.label}
                className="w-auto"
                size="sm"
              >
                <SelectValue>{audioLabel(audio)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {AUDIO_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {audioLabel(source)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <RateSelect
              label={controls.speed}
              locale={locale}
              onRateChange={handleRateChange}
              rate={rate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompareTitle({
  number,
  uploadedAt,
}: {
  number: string;
  uploadedAt: string;
}) {
  return (
    <>
      <Badge size="sm" variant="info-light">
        {number}
      </Badge>
      <span className="truncate text-muted-foreground text-xs">
        {uploadedAt}
      </span>
    </>
  );
}
