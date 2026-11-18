/** Native volume slider shared by the viewer control and the setlist mini control. */
export function PadVolume({ volume, onChange }: { volume: number; onChange(v: number): void }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      aria-label="Volume do pad"
      value={Math.round(volume * 100)}
      onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
    />
  );
}
