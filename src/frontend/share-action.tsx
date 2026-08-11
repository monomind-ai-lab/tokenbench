import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Share2, X } from 'lucide-react';

interface LegacyShareActionProps {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly label?: string;
  readonly canonicalUrl?: never;
  readonly variant?: never;
}

interface DialogShareActionProps {
  readonly canonicalUrl: string;
  readonly variant: 'secondary' | 'primary';
  readonly label?: string;
  readonly url?: never;
  readonly title?: never;
  readonly text?: never;
}

export type ShareActionProps = LegacyShareActionProps | DialogShareActionProps;

type ShareFeedback =
  | { readonly kind: 'success'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

const UNABLE_TO_SHARE_MESSAGE = 'Unable to share this link. Please copy the URL from your browser.';
const COPY_FAILED_MESSAGE = 'Copy failed. Select the URL and copy it manually.';

function LegacyShareAction({ url, title, text, label = 'Share result' }: LegacyShareActionProps) {
  const [feedback, setFeedback] = useState<ShareFeedback | null>(null);

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url, title, text });
        setFeedback({ kind: 'success', message: 'Link shared.' });
      } catch {
        setFeedback({ kind: 'error', message: UNABLE_TO_SHARE_MESSAGE });
      }
      return;
    }

    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard sharing is unavailable');
      await navigator.clipboard.writeText(url);
      setFeedback({ kind: 'success', message: 'Link copied to clipboard.' });
    } catch {
      setFeedback({ kind: 'error', message: UNABLE_TO_SHARE_MESSAGE });
    }
  };

  return <div className="share-action">
    <button className="button button-secondary button-small" type="button" onClick={share}>
      {label}
    </button>
    {feedback ? <p
      className={`share-action-feedback share-action-feedback-${feedback.kind}`}
      role={feedback.kind === 'error' ? 'alert' : 'status'}
    >{feedback.message}</p> : null}
  </div>;
}

function focusableElements(dialog: HTMLElement): readonly HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

function DialogShareAction({
  canonicalUrl,
  variant,
  label = 'Share Leaderboard',
}: DialogShareActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<ShareFeedback | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();

  const close = () => {
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const first = focusableElements(dialog)[0];
    first?.focus();
  }, [isOpen]);

  const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = focusableElements(dialog);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const copy = async () => {
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(canonicalUrl);
      setCopyStatus({ kind: 'success', message: 'Link copied.' });
    } catch {
      setCopyStatus({ kind: 'error', message: COPY_FAILED_MESSAGE });
    }
  };

  return <div className="share-action">
    <button
      ref={triggerRef}
      className={`button ${variant === 'secondary' ? 'button-secondary ' : ''}button-small share-dialog-trigger`}
      type="button"
      onClick={() => { setCopyStatus(null); setIsOpen(true); }}
    >
      <Share2 aria-hidden="true" size={16} />
      {label}
    </button>
    {isOpen ? <div
      className="share-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <section
        ref={dialogRef}
        className="share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onDialogKeyDown}
      >
        <button className="icon-button share-dialog-close" type="button" aria-label="Close share dialog" onClick={close}>
          <X aria-hidden="true" size={18} />
        </button>
        <div className="share-dialog-copy">
          <span className="eyebrow">Canonical link</span>
          <h2 id={titleId}>{label}</h2>
          <p>Copy this stable URL to share the current leaderboard view.</p>
        </div>
        <label className="share-dialog-url-field">
          <span>URL</span>
          <input
            aria-label="Share URL"
            readOnly
            value={canonicalUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <div className="share-dialog-actions">
          <button className="button" type="button" onClick={copy}>Copy</button>
        </div>
        {copyStatus ? <p
          className={`share-action-feedback share-action-feedback-${copyStatus.kind}`}
          role="status"
          aria-live="polite"
        >{copyStatus.message}</p> : null}
      </section>
    </div> : null}
  </div>;
}

export function ShareAction(props: ShareActionProps) {
  if (props.canonicalUrl !== undefined) {
    return <DialogShareAction
      canonicalUrl={props.canonicalUrl}
      variant={props.variant}
      label={props.label}
    />;
  }
  return <LegacyShareAction url={props.url} title={props.title} text={props.text} label={props.label} />;
}
