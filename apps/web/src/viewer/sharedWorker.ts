interface WorkerLike {
  destroyed: boolean;
  promise: Promise<unknown>;
}

// One pdf.js worker for every document; a destroyed or failed one is replaced on the next call.
export function createSharedWorker<T extends WorkerLike>(make: () => T): () => T {
  let worker: T | undefined;
  return () => {
    if (worker?.destroyed) worker = undefined;
    if (!worker) {
      const created = make();
      worker = created;
      created.promise.catch(() => {
        if (worker === created) worker = undefined;
      });
    }
    return worker;
  };
}
