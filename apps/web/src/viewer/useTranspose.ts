import {
  buildTransposePlan,
  parseKey,
  type Key,
  type KeyName,
  type Measure,
  type TextLine,
  type TransposePlan,
} from '@cifras/chords';
import { countCollisions, overlayOps, type OverlayOp } from '@cifras/overlay/ops';
import { useCallback, useMemo, useState } from 'react';

export interface TransposeResult {
  plan: TransposePlan | null;
  ops: OverlayOp[];
  collisions: number;
  suspects: string[];
}

export interface UseTransposeInput {
  sourceLines: TextLine[] | null;
  sourceKey: Key | null;
  /** Text measure backed by the loaded fonts (built lazily: it needs fontkit). */
  measure: Measure | null;
}

const EMPTY_OPS: OverlayOp[] = [];
const EMPTY: TransposeResult = { plan: null, ops: EMPTY_OPS, collisions: 0, suspects: [] };

// Results per target for one source; going back to a key already tried is free.
function createCache() {
  const results = new Map<KeyName, TransposeResult>();
  return {
    getOrCompute(target: KeyName, compute: () => TransposeResult): TransposeResult {
      let result = results.get(target);
      if (!result) {
        result = compute();
        results.set(target, result);
      }
      return result;
    },
  };
}

// Pure and in memory: plan + overlay ops per target (the plan alone takes a few milliseconds).
export function useTranspose({ sourceLines, sourceKey, measure }: UseTransposeInput) {
  const [target, setTargetState] = useState<KeyName | null>(null);
  const setTarget = useCallback((key: KeyName | null) => setTargetState(key), []);
  const sourceName = sourceKey?.name;
  const cache = useMemo(
    () => createCache(),
    // Keyed on the source key's name: callers may rebuild an equal `Key` object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceLines, sourceName, measure],
  );

  const result = useMemo((): TransposeResult => {
    const to = target ? parseKey(target) : null;
    if (!to || !sourceLines || !sourceKey || !measure) return EMPTY;
    return cache.getOrCompute(to.name, () => {
      const plan = buildTransposePlan({ lines: sourceLines, from: sourceKey, to, measure });
      const ops = overlayOps(plan);
      return {
        plan,
        ops,
        // What the user sees (after reflow), not plan.collisions.
        collisions: countCollisions(ops),
        suspects: [...new Set(plan.suspectSegments.flatMap((s) => s.unknown))],
      };
    });
  }, [target, sourceLines, sourceKey, measure, cache]);

  return { target, setTarget, ...result };
}
