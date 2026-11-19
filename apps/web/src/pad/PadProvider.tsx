import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { KeyName } from '@cifras/chords';
import type { PadEngine } from './padEngine';
import { padNoteFor, type PadNote } from './padNotes';
import { createPadPrefetcher } from './padPrefetch';
import type { PadOwner } from './padRoute';
import { PadContext, type PadContextValue } from './usePad';
import { useWakeLock } from './useWakeLock';

type FetchBytes = (path: string) => Promise<Uint8Array>;
type CreateEngine = (fetchBytes: FetchBytes, onGiveUp: () => void) => Promise<PadEngine>;

const VOLUME_KEY = 'cifras.pad.volume';
const DEFAULT_VOLUME = 0.6;
/** Stop fade-out (3 s, padEngine FADE.outSec) plus a margin; kept here to avoid importing the lazy engine. */
const TEARDOWN_AFTER_STOP_MS = 3500;
const CROSSFADE_NOTICE = 'Não foi possível trocar o tom do pad.';

/**
 * Only the synchronous part lives in the main bundle: the AudioContext must be created
 * and resumed inside the user's tap (iOS), before any await. The engine and loader
 * (decodeAudioData, buffer sources) come from the lazy chunk.
 */
function closeQuietly(ctx: AudioContext): void {
  try {
    void Promise.resolve(ctx.close()).catch(() => {});
  } catch {
    // already closed or unsupported: nothing to release
  }
}

/**
 * iOS plays Web Audio in the "ambient" session category by default, which the Ring/Silent
 * switch mutes. Phones are often silenced during a service, so ask for "playback" (Audio
 * Session API, recent Safari). Synchronous, inside the tap; absent or failing is harmless.
 */
function requestPlaybackAudioSession(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch {
    // unsupported or refused: the pad just follows the default session
  }
}

const defaultCreateEngine: CreateEngine = async (fetchBytes, onGiveUp) => {
  requestPlaybackAudioSession();
  const ctx = new AudioContext({ latencyHint: 'playback' });
  ctx.resume().catch(() => {});
  try {
    const { buildPadEngine } = await import('./padBuild');
    const engine = buildPadEngine({ ctx, fetchBytes, onGiveUp });
    // The factory owns the context: disposing the engine releases it too.
    return new Proxy(engine, {
      get(target, prop) {
        if (prop === 'dispose') {
          return () => {
            target.dispose();
            closeQuietly(ctx);
          };
        }
        const value: unknown = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  } catch (error) {
    closeQuietly(ctx);
    throw error;
  }
};

function readVolume(storage: Pick<Storage, 'getItem'> | undefined): number {
  try {
    const raw = storage?.getItem(VOLUME_KEY);
    if (raw === null || raw === undefined || raw.trim() === '') return DEFAULT_VOLUME;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function PadProvider({
  fetchBytes,
  children,
  createEngine = defaultCreateEngine,
  storage,
}: {
  fetchBytes: FetchBytes;
  children: ReactNode;
  createEngine?: CreateEngine;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}) {
  const store = storage ?? defaultStorage();

  const [status, setStatus] = useState<PadContextValue['status']>('off');
  const [note, setNote] = useState<PadNote | null>(null);
  const [owner, setOwner] = useState<PadOwner | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(() => readVolume(store));

  const statusRef = useRef(status);
  const noteRef = useRef<PadNote | null>(null);
  const volumeRef = useRef(volume);
  const desiredRef = useRef<PadNote | null>(null);
  /** Note the engine is heading to (differs from noteRef while a crossfade is in flight). */
  const targetRef = useRef<PadNote | null>(null);
  const crossfadeSeqRef = useRef(0);
  const teardownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(0);
  const enginePromiseRef = useRef<Promise<PadEngine> | null>(null);
  const engineRef = useRef<PadEngine | null>(null);
  const fetchBytesRef = useRef(fetchBytes);
  const createEngineRef = useRef(createEngine);
  useEffect(() => {
    fetchBytesRef.current = fetchBytes;
    createEngineRef.current = createEngine;
  });

  const changeStatus = useCallback((next: PadContextValue['status']) => {
    statusRef.current = next;
    setStatus(next);
  }, []);
  const changeNote = useCallback((next: PadNote | null) => {
    noteRef.current = next;
    setNote(next);
  }, []);

  const prefetchNotes = useMemo(() => createPadPrefetcher(fetchBytes), [fetchBytes]);

  const clearTeardownTimer = useCallback(() => {
    if (teardownTimerRef.current !== null) {
      clearTimeout(teardownTimerRef.current);
      teardownTimerRef.current = null;
    }
  }, []);

  /** Hard teardown: the next toggle builds a fresh engine (and AudioContext). */
  const teardown = useCallback(() => {
    clearTeardownTimer();
    tokenRef.current += 1;
    const engine = engineRef.current;
    engineRef.current = null;
    enginePromiseRef.current = null; // a pending run disposes the engine once created
    desiredRef.current = null;
    targetRef.current = null;
    engine?.dispose();
  }, [clearTeardownTimer]);

  /** Frees the engine (and its context) after the fade window unless a new toggle cancels it. */
  const armTeardown = useCallback(() => {
    clearTeardownTimer();
    teardownTimerRef.current = setTimeout(() => {
      teardownTimerRef.current = null;
      teardown();
    }, TEARDOWN_AFTER_STOP_MS);
  }, [clearTeardownTimer, teardown]);

  /** Cancels any in-flight run and fades the engine out; frees it after the fade. */
  const halt = useCallback(() => {
    tokenRef.current += 1;
    clearTeardownTimer();
    if (engineRef.current) {
      engineRef.current.stop();
      armTeardown();
    } else enginePromiseRef.current = null; // the pending run disposes the engine once created
    desiredRef.current = null;
    targetRef.current = null;
    changeStatus('off');
    changeNote(null);
    setNotice(null);
  }, [armTeardown, changeNote, changeStatus, clearTeardownTimer]);

  const crossfade = useCallback(
    async (engine: PadEngine, target: PadNote, token: number) => {
      crossfadeSeqRef.current += 1;
      const seq = crossfadeSeqRef.current;
      targetRef.current = target;
      const stale = () => tokenRef.current !== token || crossfadeSeqRef.current !== seq;
      try {
        await engine.crossfadeTo(target);
        if (stale()) return;
        changeNote(target);
        setNotice(null);
      } catch {
        if (stale()) return;
        targetRef.current = noteRef.current;
        setNotice(CROSSFADE_NOTICE);
      }
    },
    [changeNote],
  );

  const run = useCallback(
    async (target: PadNote, token: number) => {
      let promise = enginePromiseRef.current;
      if (!promise) {
        // Called synchronously inside the tap: the default factory creates the AudioContext here.
        promise = createEngineRef.current(
          (p) => fetchBytesRef.current(p),
          () => {
            // The context stalled: hard cut, so it can't come back as ghost audio.
            teardown();
            changeStatus('off');
            changeNote(null);
            setNotice(null);
          },
        );
        enginePromiseRef.current = promise;
      }
      const mine = promise;
      let engine: PadEngine;
      try {
        engine = await mine;
      } catch {
        if (enginePromiseRef.current === mine) enginePromiseRef.current = null;
        if (tokenRef.current === token) {
          changeStatus('error');
          changeNote(null);
        }
        return;
      }
      if (enginePromiseRef.current !== mine) {
        engine.dispose(); // cancelled or unmounted before creation finished: no orphan context
        return;
      }
      engineRef.current = engine;
      engine.setVolume(volumeRef.current);
      if (tokenRef.current !== token) return;
      // A follow() that arrived while loading: start directly in the final key.
      const first = desiredRef.current ?? target;
      desiredRef.current = null;
      targetRef.current = first;
      try {
        await engine.start(first);
      } catch {
        if (tokenRef.current === token) {
          changeStatus('error');
          changeNote(null);
          // No route change will free the engine inside a setlist: don't leave a silent context running.
          armTeardown();
        }
        return;
      }
      if (tokenRef.current !== token) return;
      changeNote(first);
      changeStatus('playing');
      const desired = desiredRef.current;
      desiredRef.current = null;
      if (desired && desired !== first) await crossfade(engine, desired, token);
    },
    [armTeardown, changeNote, changeStatus, crossfade, teardown],
  );

  const toggle = useCallback(
    (key: KeyName, nextOwner: PadOwner) => {
      if (statusRef.current === 'loading' || statusRef.current === 'playing') {
        halt();
        return;
      }
      const target = padNoteFor(key);
      if (!target) return;
      clearTeardownTimer();
      tokenRef.current += 1;
      desiredRef.current = null;
      targetRef.current = target;
      setNotice(null);
      setOwner(nextOwner);
      changeNote(target);
      changeStatus('loading');
      void run(target, tokenRef.current);
    },
    [changeNote, changeStatus, clearTeardownTimer, halt, run],
  );

  const follow = useCallback(
    (key: KeyName | null) => {
      if (!key) return;
      const target = padNoteFor(key);
      if (!target) return;
      const current = statusRef.current;
      if (current === 'loading') {
        desiredRef.current = target;
        return;
      }
      const engine = engineRef.current;
      if (current !== 'playing' || !engine || targetRef.current === target) return;
      void crossfade(engine, target, tokenRef.current);
    },
    [crossfade],
  );

  const setVolume = useCallback(
    (next: number) => {
      volumeRef.current = next;
      setVolumeState(next);
      engineRef.current?.setVolume(next);
      try {
        store?.setItem(VOLUME_KEY, String(next));
      } catch {
        // storage blocked: the volume just isn't remembered
      }
    },
    [store],
  );

  const prefetch = useCallback(
    (keys: readonly KeyName[]) => {
      const notes: PadNote[] = [];
      for (const key of keys) {
        const n = padNoteFor(key);
        if (n) notes.push(n);
      }
      prefetchNotes(notes);
    },
    [prefetchNotes],
  );

  useWakeLock(status === 'playing');

  useEffect(() => teardown, [teardown]);

  const value = useMemo<PadContextValue>(
    () => ({ status, note, owner, volume, notice, toggle, follow, setVolume, prefetch }),
    [status, note, owner, volume, notice, toggle, follow, setVolume, prefetch],
  );

  return <PadContext.Provider value={value}>{children}</PadContext.Provider>;
}
