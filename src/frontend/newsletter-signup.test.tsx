import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewsletterSignup } from './newsletter-signup';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.removeAttribute('tabindex');
});

describe('NewsletterSignup', () => {
  it('leaves alerts unchecked and explains double opt in', () => {
    render(<NewsletterSignup context="footer" />);

    expect(screen.getByRole('heading', { name: 'The Monthly LLM API Cost & Benchmark Cheatsheet (PDF/CSV)' })).toBeInTheDocument();
    expect(screen.getByText('A downloadable, printable reference sheet listing top models, current per-1M token rates, context windows, and category ranks.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Notify me when new models or price drops are added to TokenBench.' })).not.toBeChecked();
    expect(screen.getByText(/confirmation email/i)).toBeInTheDocument();
  });

  it('reveals monthly consent only after a compact comparison alert opt-in', () => {
    render(<NewsletterSignup context="compare" />);

    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    const alerts = screen.getByRole('checkbox', { name: 'Notify me when new models or price drops are added to TokenBench.' });
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
    render(<NewsletterSignup context="compare" />);

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

  it('moves focus from the disabled submit button to a delayed confirmation status', async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
    render(<NewsletterSignup context="footer" />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'builder@example.com' } });
    const submit = screen.getByRole('button', { name: 'Get the cheatsheet' });
    submit.focus();
    expect(submit).toHaveFocus();
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));
    expect(submit).toBeDisabled();
    document.body.tabIndex = -1;
    document.body.focus();
    expect(document.body).toHaveFocus();

    resolveRequest(new Response('{"status":"confirmation-required"}', { status: 202 }));

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(status).toHaveFocus());
  });

  it('returns focus to the email input after a delayed malformed 202 retry', async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
    render(<NewsletterSignup context="footer" />);

    const email = screen.getByLabelText('Email address');
    fireEvent.change(email, { target: { value: 'builder@example.com' } });
    email.focus();
    expect(email).toHaveFocus();
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));
    expect(email).toBeDisabled();
    document.body.tabIndex = -1;
    document.body.focus();
    expect(document.body).toHaveFocus();

    resolveRequest(new Response('{"status":"confirmation-required"', { status: 202 }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t complete that signup. Please try again.');
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toBeEnabled();
    expect(email).toHaveValue('builder@example.com');
  });

  it.each([
    ['non-JSON', 'secret backend diagnostic'],
    ['malformed JSON', '{"status":"confirmation-required"'],
    ['wrong status', '{"status":"subscribed","detail":"secret backend diagnostic"}'],
    ['extra response fields', '{"status":"confirmation-required","detail":"secret backend diagnostic"}'],
  ])('treats a 202 with %s as retryable without exposing its body', async (_case, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {
      status: 202,
      headers: { 'content-type': 'application/json' },
    })));
    render(<NewsletterSignup context="compare" />);

    const alerts = screen.getByRole('checkbox');
    fireEvent.click(alerts);
    const email = screen.getByLabelText('Email address');
    fireEvent.change(email, { target: { value: 'builder@example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t complete that signup. Please try again.');
    expect(email).toHaveValue('builder@example.com');
    expect(alerts).toBeChecked();
    expect(screen.queryByText(/secret backend diagnostic/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Check your email to confirm your subscription.')).not.toBeInTheDocument();
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

  it.each([
    ['double dots in the domain', 'builder@example..com'],
    ['a leading domain hyphen', 'builder@-example.com'],
    ['a trailing domain hyphen', 'builder@example-.com'],
    ['a local part longer than 64 characters', `${'a'.repeat(65)}@example.com`],
    ['a domain label longer than 63 characters', `builder@${'a'.repeat(64)}.com`],
  ])('rejects %s using the newsletter contract boundaries', (_case, address) => {
    const fetchSignup = vi.fn();
    vi.stubGlobal('fetch', fetchSignup);
    render(<NewsletterSignup context="footer" />);

    const email = screen.getByLabelText('Email address');
    fireEvent.change(email, { target: { value: address } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(email).toHaveValue(address);
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

  it('does not start a duplicate request while submission is in flight', async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    const fetchSignup = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal('fetch', fetchSignup);
    render(<NewsletterSignup context="footer" />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'builder@example.com' } });
    const form = screen.getByRole('form', { name: 'Newsletter signup' });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(fetchSignup).toHaveBeenCalledTimes(1);
    resolveRequest(new Response('{"status":"confirmation-required"}', { status: 202 }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveFocus());
  });

  it('aborts an in-flight request when the signup unmounts', () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }));
    const { unmount } = render(<NewsletterSignup context="footer" />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'builder@example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));
    unmount();

    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal?.aborted).toBe(true);
  });

  it('ignores an aborted request outcome without showing retry guidance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Request aborted', 'AbortError')));
    render(<><button type="button">Outside signup</button><NewsletterSignup context="footer" /></>);

    const email = screen.getByLabelText('Email address');
    fireEvent.change(email, { target: { value: 'builder@example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));
    const outside = screen.getByRole('button', { name: 'Outside signup' });
    outside.focus();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Get the cheatsheet' })).toBeEnabled());
    expect(email).toHaveValue('builder@example.com');
    expect(outside).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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
