import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewsletterSignup } from './newsletter-signup';

afterEach(() => vi.unstubAllGlobals());

describe('NewsletterSignup', () => {
  it('leaves alerts unchecked and explains double opt in', () => {
    render(<NewsletterSignup context="footer" />);

    expect(screen.getByRole('heading', { name: 'The Monthly LLM API Cost & Benchmark Cheatsheet (PDF/CSV)' })).toBeInTheDocument();
    expect(screen.getByText('A downloadable, printable reference sheet listing top models, current per-1M token rates, context windows, and category ranks.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /new models or price drops/i })).not.toBeChecked();
    expect(screen.getByText(/confirmation email/i)).toBeInTheDocument();
  });

  it('reveals monthly consent only after a compact comparison alert opt-in', () => {
    render(<NewsletterSignup context="compare" alertLabel="Notify me when new models or price drops are added to TokenBench" />);

    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    const alerts = screen.getByRole('checkbox', { name: 'Notify me when new models or price drops are added to TokenBench' });
    expect(alerts).not.toBeChecked();

    fireEvent.click(alerts);

    expect(screen.getByRole('form', { name: 'Newsletter signup' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByText(/You’ll also receive the Monthly LLM API Cost & Benchmark Cheatsheet \(PDF\/CSV\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notify me' })).toBeInTheDocument();
  });

  it('allows a comparison placement to opt out of compact disclosure', () => {
    render(<NewsletterSignup compact={false} context="compare" />);

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('submits opted-in values and announces confirmation-required', async () => {
    const fetchSignup = vi.fn().mockResolvedValue(new Response('{"status":"confirmation-required"}', {
      status: 202,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchSignup);
    render(<NewsletterSignup context="compare" alertLabel="Notify me when new models or price drops are added to TokenBench" />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'builder@example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Check your email to confirm your subscription.');
    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(fetchSignup).toHaveBeenCalledWith('/api/newsletter/subscribe', expect.objectContaining({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }));
    const [, request] = fetchSignup.mock.calls[0]!;
    expect(JSON.parse((request as RequestInit).body as string)).toEqual({
      context: 'compare',
      email: 'builder@example.com',
      honeypot: '',
      modelAndPriceAlerts: true,
      monthlyCheatsheet: true,
    });
  });

  it('keeps an invalid address local to the form', () => {
    const fetchSignup = vi.fn();
    vi.stubGlobal('fetch', fetchSignup);
    render(<NewsletterSignup context="footer" />);

    const email = screen.getByLabelText('Email address');
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveValue('not-an-email');
    expect(fetchSignup).not.toHaveBeenCalled();
  });

  it('uses the form’s accessible invalid-email feedback instead of browser-native blocking', () => {
    render(<NewsletterSignup context="footer" />);

    expect(screen.getByRole('form', { name: 'Newsletter signup' })).toHaveAttribute('novalidate');
  });

  it('does not claim confirmation on a retryable 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      '{"status":"temporarily-unavailable"}',
      { status: 503, headers: { 'content-type': 'application/json' } },
    )));
    render(<NewsletterSignup context="footer" />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'builder@example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t complete that signup. Please try again.');
    expect(screen.getByLabelText('Email address')).toHaveValue('builder@example.com');
    expect(screen.queryByText('Check your email to confirm your subscription.')).not.toBeInTheDocument();
  });

  it('disables signup controls while a submission is in flight', async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
    render(<NewsletterSignup context="footer" />);

    const email = screen.getByLabelText('Email address');
    const alerts = screen.getByRole('checkbox', { name: /new models or price drops/i });
    fireEvent.change(email, { target: { value: 'builder@example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));

    expect(email).toBeDisabled();
    expect(alerts).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Get the cheatsheet' })).toBeDisabled();

    resolveRequest(new Response('{"status":"confirmation-required"}', { status: 202 }));
    await screen.findByRole('status');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get the cheatsheet' })).toBeEnabled());
  });

  it('keeps the bot trap out of the accessible form and forwards its value', async () => {
    const fetchSignup = vi.fn().mockResolvedValue(new Response('{"status":"confirmation-required"}', { status: 202 }));
    vi.stubGlobal('fetch', fetchSignup);
    render(<NewsletterSignup context="footer" />);

    expect(screen.queryByRole('textbox', { name: 'Website' })).not.toBeInTheDocument();
    const honeypot = document.querySelector<HTMLInputElement>('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute('tabindex', '-1');
    fireEvent.change(honeypot!, { target: { value: 'bot-filled-this' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'builder@example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));

    await screen.findByRole('status');
    const [, request] = fetchSignup.mock.calls[0]!;
    expect(JSON.parse((request as RequestInit).body as string)).toMatchObject({ honeypot: 'bot-filled-this' });
  });
});
