type ShareImpl = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
};

export function stubShare(impl: ShareImpl): void {
  for (const key of ['share', 'canShare'] as const) {
    const value = impl[key];
    if (value) {
      Object.defineProperty(navigator, key, { configurable: true, value });
    }
  }
}

export function unstubShare(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (navigator as any).share;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (navigator as any).canShare;
}
