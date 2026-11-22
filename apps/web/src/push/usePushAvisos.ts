import { useEffect, useState } from 'react';
import type { AvisosStatus, PushService, TestStatus } from './types';

export interface AvisosView {
  status: AvisosStatus;
  test: TestStatus;
  enable(): void;
  disable(): void;
  sendTest(): void;
}

export function usePushAvisos(service: PushService): AvisosView {
  const [status, setStatus] = useState<AvisosStatus>('checking');
  const [test, setTest] = useState<TestStatus>('idle');

  useEffect(() => {
    let alive = true;
    service
      .load()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [service]);

  // `work()` roda na mesma chamada do clique: o toque em Ativar chega ao SDK sem await antes.
  const run = (pending: AvisosStatus, work: () => Promise<AvisosStatus>) => {
    setStatus(pending);
    work().then(setStatus, () => setStatus('error'));
  };

  return {
    status,
    test,
    enable: () => {
      setTest('idle');
      run('enabling', () => service.enable());
    },
    disable: () => {
      setTest('idle');
      run('disabling', () => service.disable());
    },
    sendTest: () => {
      setTest('sending');
      service
        .sendTest()
        .then(async (result) => {
          setTest(result);
          // Falhou: o servidor pode ter apagado o aparelho; relê o estado da linha.
          if (result === 'failed') setStatus(await service.load());
        })
        .catch(() => setTest('failed'));
    },
  };
}
