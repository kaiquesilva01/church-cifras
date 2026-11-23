import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AvisosStatus, PushService } from './types';
import { AvisosRow } from './AvisosRow';

function service(status: AvisosStatus, overrides: Partial<PushService> = {}): PushService {
  return {
    load: vi.fn(async () => status),
    enable: vi.fn(async () => 'active' as const),
    disable: vi.fn(async () => 'available' as const),
    sendTest: vi.fn(async () => 'sent' as const),
    revalidate: vi.fn(async () => {}),
    forgetDevice: vi.fn(async () => {}),
    ...overrides,
  };
}

const row = (s: PushService) =>
  render(
    <ul>
      <AvisosRow service={s} />
    </ul>,
  );

describe('AvisosRow', () => {
  it('checking: "Verificando…" with a disabled Ativar pill', () => {
    row(service('checking'));
    expect(screen.getByText('Verificando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar' })).toBeDisabled();
  });

  it('available: copy and an enabled Ativar pill with its aria-label', async () => {
    row(service('available'));
    expect(
      await screen.findByText('Receba repertório novo e lembrete do ensaio neste aparelho'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeEnabled();
  });

  it('calls enable on the tap', async () => {
    const s = service('available');
    row(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }));
    expect(s.enable).toHaveBeenCalledTimes(1);
  });

  it('enabling: "Ativando…", pill disabled, row aria-busy', async () => {
    const s = service('available', { enable: vi.fn(() => new Promise<AvisosStatus>(() => {})) });
    const { container } = row(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }));
    expect(await screen.findByText('Ativando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar' })).toBeDisabled();
    expect(container.querySelector('li')).toHaveAttribute('aria-busy', 'true');
  });

  it('disabling: "Desativando…" with a disabled Desativar pill', async () => {
    const s = service('active', { disable: vi.fn(() => new Promise<AvisosStatus>(() => {})) });
    row(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar avisos neste aparelho' }));
    expect(await screen.findByText('Desativando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeDisabled();
  });

  it('active: only "Ativados" is in success; the rest of the line is muted', async () => {
    row(service('active'));
    const word = await screen.findByText('Ativados');
    expect(word).toHaveClass('push-on');
    expect(word.parentElement).toHaveTextContent('Ativados neste aparelho');
    expect(word.parentElement).toHaveClass('muted');
    expect(
      screen.getByRole('button', { name: 'Desativar avisos neste aparelho' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar aviso de teste' })).toBeInTheDocument();
  });

  it('blocked and ios-install have no action pill', async () => {
    const { unmount } = row(service('blocked'));
    expect(await screen.findByText(/Bloqueados no navegador/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ativar|Desativar/ })).toBeNull();
    unmount();
    row(service('ios-install'));
    expect(
      await screen.findByText('No Safari: Compartilhar › Adicionar à Tela de Início'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ativar|Desativar/ })).toBeNull();
  });

  it('unsupported: "Seu navegador não permite avisos" and no button', async () => {
    row(service('unsupported'));
    expect(await screen.findByText('Seu navegador não permite avisos')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('error: role=alert, and Tentar de novo reloads the status without calling enable', async () => {
    const s = service('error');
    row(s);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível ativar os avisos. Tente de novo.');
    expect(alert).toHaveClass('push-alert');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(s.enable).not.toHaveBeenCalled();
    expect(s.load).toHaveBeenCalledTimes(2);
  });

  it('test success goes to role=status with the success notice', async () => {
    row(service('active'));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de teste' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Aviso de teste enviado. Ele chega em instantes.',
      ),
    );
    expect(screen.getByText('Aviso de teste enviado. Ele chega em instantes.')).toHaveClass(
      'notice',
    );
  });

  it('test failure goes to role=alert with the push-alert class', async () => {
    row(service('active', { sendTest: vi.fn(async () => 'failed' as const) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de teste' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível enviar o teste.');
    expect(alert).toHaveClass('push-alert');
  });

  it('the status region is always mounted and empty until a test succeeds', async () => {
    row(service('available'));
    await screen.findByText('Receba repertório novo e lembrete do ensaio neste aparelho');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('status')).toHaveClass('push-status');
  });

  it('the status region is mounted and empty in the active state too', async () => {
    row(service('active'));
    await screen.findByText('Ativados');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('status')).toHaveClass('push-status');
  });

  it('a new action resets the test feedback: after sent, Desativar empties the status region', async () => {
    row(service('active'));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de teste' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Aviso de teste enviado. Ele chega em instantes.',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Desativar avisos neste aparelho' }));
    await screen.findByText('Receba repertório novo e lembrete do ensaio neste aparelho');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('disables the Desativar pill while the test is sending', async () => {
    row(service('active', { sendTest: vi.fn(() => new Promise<'sent'>(() => {})) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de teste' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Desativar avisos neste aparelho' }),
      ).toBeDisabled(),
    );
  });

  it('keeps the test feedback when the server pruned the device (status goes back to available)', async () => {
    const s = service('active', {
      sendTest: vi.fn(async () => 'failed' as const),
      load: vi.fn().mockResolvedValueOnce('active').mockResolvedValue('available'),
    });
    row(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de teste' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar o teste.');
    expect(
      await screen.findByText('Receba repertório novo e lembrete do ensaio neste aparelho'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar aviso de teste' })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível enviar o teste.');
  });
});
