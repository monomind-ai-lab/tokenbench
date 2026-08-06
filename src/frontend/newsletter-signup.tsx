import { useState, type FormEvent } from 'react';

export interface NewsletterSignupProps {
  readonly context: 'footer' | 'compare';
  readonly compact?: boolean;
  readonly alertLabel?: string;
}

type SignupFeedback = 'idle' | 'invalid-email' | 'confirmation-required' | 'retry';

function hasPlausibleEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export function NewsletterSignup({ context, compact, alertLabel = 'Send me alerts about new models or price drops' }: NewsletterSignupProps) {
  const [modelAndPriceAlerts, setModelAndPriceAlerts] = useState(false);
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [feedback, setFeedback] = useState<SignupFeedback>('idle');
  const [submitting, setSubmitting] = useState(false);
  const isCompact = compact ?? context === 'compare';
  const showForm = !isCompact || modelAndPriceAlerts;
  const invalidEmail = feedback === 'invalid-email';
  const feedbackCopy = feedback === 'invalid-email'
    ? 'Enter a valid email address.'
    : feedback === 'confirmation-required'
      ? 'Check your email to confirm your subscription.'
      : feedback === 'retry'
        ? 'We couldn’t complete that signup. Please try again.'
        : null;

  const submitSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!hasPlausibleEmailAddress(normalizedEmail)) {
      setFeedback('invalid-email');
      return;
    }
    setFeedback('idle');
    setSubmitting(true);
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          monthlyCheatsheet: true,
          modelAndPriceAlerts,
          context,
          honeypot,
        }),
      });
      if (response.status === 202) {
        setEmail('');
        setFeedback('confirmation-required');
        return;
      }
    } catch {
      // The browser receives the same retry guidance for network and service failures.
    } finally {
      setSubmitting(false);
    }
    setFeedback('retry');
  };

  return <section className="newsletter-signup" data-compact={isCompact} data-context={context}>
    {showForm ? <div className="newsletter-signup-offer">
      <h2>The Monthly LLM API Cost &amp; Benchmark Cheatsheet (PDF/CSV)</h2>
      <p>A downloadable, printable reference sheet listing top models, current per-1M token rates, context windows, and category ranks.</p>
    </div> : null}
    <label className="newsletter-signup-alert-control"><input checked={modelAndPriceAlerts} disabled={submitting} onChange={(event) => setModelAndPriceAlerts(event.target.checked)} type="checkbox" />{alertLabel}</label>
    {showForm ? <form aria-busy={submitting} aria-label="Newsletter signup" noValidate onSubmit={submitSignup}>
      <label htmlFor={`newsletter-email-${context}`}>Email address</label>
      <input aria-describedby={invalidEmail ? `newsletter-email-error-${context}` : undefined} aria-invalid={invalidEmail || undefined} disabled={submitting} id={`newsletter-email-${context}`} name="email" onChange={(event) => { setEmail(event.target.value); setFeedback('idle'); }} required type="email" value={email} />
      <p>You’ll also receive the Monthly LLM API Cost &amp; Benchmark Cheatsheet (PDF/CSV).</p>
      <p>We’ll send a confirmation email before anything is delivered.</p>
      <div aria-hidden="true" className="newsletter-signup-honeypot">
        <label htmlFor={`newsletter-website-${context}`}>Website</label>
        <input autoComplete="off" disabled={submitting} id={`newsletter-website-${context}`} name="website" onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} type="text" value={honeypot} />
      </div>
      <button disabled={submitting} type="submit">{isCompact ? 'Notify me' : 'Get the cheatsheet'}</button>
      {feedbackCopy ? <p id={invalidEmail ? `newsletter-email-error-${context}` : undefined} role={feedback === 'confirmation-required' ? 'status' : 'alert'}>{feedbackCopy}</p> : null}
    </form> : null}
  </section>;
}
