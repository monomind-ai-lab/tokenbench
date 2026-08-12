/**
 * Standalone transactional page rendered after Brevo double opt-in confirms a
 * newsletter subscription. It deliberately avoids AppShell: no primary
 * navigation, language/theme chrome, or footer actions, so the only action is
 * the single `Start Exploring` link.
 */
export function NewsletterConfirmedPage() {
  return (
    <main className="page-main newsletter-confirmed" aria-labelledby="newsletter-confirmed-heading" tabIndex={-1}>
      <div className="newsletter-confirmed-mark" aria-hidden="true">TokenBench</div>
      <p className="eyebrow">Email confirmed</p>
      <h1 id="newsletter-confirmed-heading">Your subscription is confirmed.</h1>
      <p>The current TokenBench test cheatsheet will arrive by email.</p>
      <a className="button" href="/">Start Exploring</a>
    </main>
  );
}
