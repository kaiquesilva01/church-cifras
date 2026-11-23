import { describe, expect, it } from 'vitest';
import { avisosSession, createAvisosSession } from './avisosSession';

describe('createAvisosSession', () => {
  it('começa aberta, fecha, e só reabre com reset (helper de teste)', () => {
    const session = createAvisosSession();
    expect(session.isClosed()).toBe(false);
    session.close();
    expect(session.isClosed()).toBe(true);
    session.reset();
    expect(session.isClosed()).toBe(false);
  });

  it('cada sessão criada é independente', () => {
    const a = createAvisosSession();
    const b = createAvisosSession();
    a.close();
    expect(b.isClosed()).toBe(false);
  });

  it('a sessão do app começa aberta', () => {
    expect(avisosSession.isClosed()).toBe(false);
  });
});
