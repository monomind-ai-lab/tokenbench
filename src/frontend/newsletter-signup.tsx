import { useEffect, useRef, useState, type FormEvent } from 'react';

export interface NewsletterSignupProps {
  readonly context: 'footer' | 'compare';
  readonly compact?: boolean;
  readonly alertLabel?: string;
}

export const MODEL_PRICE_ALERT_LABEL = 'Notify me when new models or price drops are added to TokenBench.';

type SignupFeedback = 'idle' | 'invalid-profile' | 'invalid-email' | 'confirmation-required' | 'retry';
type PostSubmissionFocus = 'email' | 'confirmation-status';

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;
const EMAIL_CONTROL_OR_WHITESPACE_PATTERN = /[\u0000-\u001f\u007f-\u009f\s]/u;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu;

function isValidNewsletterEmailAddress(value: string): boolean {
  if (value.length > MAX_EMAIL_LENGTH || EMAIL_CONTROL_OR_WHITESPACE_PATTERN.test(value)) return false;

  const separator = value.indexOf('@');
  if (separator <= 0 || separator !== value.lastIndexOf('@') || separator === value.length - 1) return false;

  const localPart = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (localPart.length > MAX_LOCAL_PART_LENGTH || domain.length > MAX_DOMAIN_LENGTH) return false;

  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((label) => DOMAIN_LABEL_PATTERN.test(label));
}

function isConfirmationRequiredResponse(value: unknown): value is { readonly status: 'confirmation-required' } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === 1
    && keys[0] === 'status'
    && (value as Record<string, unknown>).status === 'confirmation-required';
}

function isAbortError(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && 'name' in error
    && error.name === 'AbortError';
}

export function NewsletterSignup({ context, compact, alertLabel = MODEL_PRICE_ALERT_LABEL }: NewsletterSignupProps) {
  const [modelAndPriceAlerts, setModelAndPriceAlerts] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [feedback, setFeedback] = useState<SignupFeedback>('idle');
  const [submitting, setSubmitting] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const submissionInFlight = useRef(false);
  const emailInput = useRef<HTMLInputElement | null>(null);
  const confirmationStatus = useRef<HTMLParagraphElement | null>(null);
  const postSubmissionFocus = useRef<PostSubmissionFocus | null>(null);
  const isCompact = compact ?? context === 'compare';
  const showForm = !isCompact || modelAndPriceAlerts;
  const invalidEmail = feedback === 'invalid-email';
  const feedbackCopy = feedback === 'invalid-email'
    ? 'Enter a valid email address.'
    : feedback === 'invalid-profile'
      ? 'Enter your first name and company.'
    : feedback === 'confirmation-required'
      ? 'Check your email to confirm your subscription.'
      : feedback === 'retry'
        ? 'We couldn’t complete that signup. Please try again.'
        : null;

  useEffect(() => {
    if (submitting || postSubmissionFocus.current === null) return;
    const focusTarget = postSubmissionFocus.current;
    postSubmissionFocus.current = null;
    if (focusTarget === 'confirmation-status') confirmationStatus.current?.focus();
    else emailInput.current?.focus();
  }, [feedback, submitting]);

  useEffect(() => () => {
    const controller = activeRequest.current;
    activeRequest.current = null;
    submissionInFlight.current = false;
    postSubmissionFocus.current = null;
    controller?.abort();
  }, []);

  const submitSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlight.current) return;
    const normalizedEmail = email.trim();
    const normalizedFirstName = firstName.trim();
    const normalizedCompany = company.trim();
    if (!normalizedFirstName || !normalizedCompany) {
      setFeedback('invalid-profile');
      return;
    }
    if (!isValidNewsletterEmailAddress(normalizedEmail)) {
      setFeedback('invalid-email');
      return;
    }
    const controller = new AbortController();
    submissionInFlight.current = true;
    activeRequest.current = controller;
    setFeedback('idle');
    setSubmitting(true);
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: normalizedFirstName,
          company: normalizedCompany,
          email: normalizedEmail,
          monthlyCheatsheet: true,
          modelAndPriceAlerts,
          context,
          honeypot,
        }),
        signal: controller.signal,
      });
      if (response.status === 202 && isConfirmationRequiredResponse(await response.json())) {
        postSubmissionFocus.current = 'confirmation-status';
        setEmail('');
        setFirstName('');
        setCompany('');
        setFeedback('confirmation-required');
        return;
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      // The browser receives the same retry guidance for network and service failures.
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        submissionInFlight.current = false;
        setSubmitting(false);
      }
    }
    postSubmissionFocus.current = 'email';
    setFeedback('retry');
  };

  return <section className="newsletter-signup" data-compact={isCompact} data-context={context}>
    {showForm ? <div className="newsletter-signup-offer">
      <h2>The Monthly LLM API Cost &amp; Benchmark Cheatsheet (PDF/CSV)</h2>
      <p>A downloadable, printable reference sheet listing top models, current per-1M token rates, context windows, and category ranks.</p>
    </div> : null}
    <label className="newsletter-signup-alert-control"><input checked={modelAndPriceAlerts} disabled={submitting} onChange={(event) => setModelAndPriceAlerts(event.target.checked)} type="checkbox" />{alertLabel}</label>
    {showForm ? <form aria-busy={submitting} aria-label="Newsletter signup" noValidate onSubmit={submitSignup}>
      <label htmlFor={`newsletter-first-name-${context}`}>First name</label>
      <input autoComplete="given-name" disabled={submitting} id={`newsletter-first-name-${context}`} maxLength={120} name="firstName" onChange={(event) => { setFirstName(event.target.value); setFeedback('idle'); }} required type="text" value={firstName} />
      <label htmlFor={`newsletter-company-${context}`}>Company</label>
      <input autoComplete="organization" disabled={submitting} id={`newsletter-company-${context}`} maxLength={120} name="company" onChange={(event) => { setCompany(event.target.value); setFeedback('idle'); }} required type="text" value={company} />
      <label htmlFor={`newsletter-email-${context}`}>Email address</label>
      <input aria-describedby={invalidEmail ? `newsletter-email-error-${context}` : undefined} aria-invalid={invalidEmail || undefined} disabled={submitting} id={`newsletter-email-${context}`} name="email" onChange={(event) => { setEmail(event.target.value); setFeedback('idle'); }} ref={emailInput} required type="email" value={email} />
      <p>You’ll also receive the Monthly LLM API Cost &amp; Benchmark Cheatsheet (PDF/CSV).</p>
      <p>We’ll send a confirmation email before anything is delivered.</p>
      <div aria-hidden="true" className="newsletter-signup-honeypot">
        <label htmlFor={`newsletter-website-${context}`}>Website</label>
        <input autoComplete="off" disabled={submitting} id={`newsletter-website-${context}`} name="website" onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} type="text" value={honeypot} />
      </div>
      <button disabled={submitting} type="submit">{isCompact ? 'Notify me' : 'Get the cheatsheet'}</button>
      {feedbackCopy ? <p id={invalidEmail ? `newsletter-email-error-${context}` : undefined} ref={feedback === 'confirmation-required' ? confirmationStatus : undefined} role={feedback === 'confirmation-required' ? 'status' : 'alert'} tabIndex={feedback === 'confirmation-required' ? -1 : undefined}>{feedbackCopy}</p> : null}
    </form> : null}
  </section>;
}
