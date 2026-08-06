import { useState } from 'react';

export interface ShareActionProps {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly label?: string;
}

type ShareFeedback =
  | { readonly kind: 'success'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

const UNABLE_TO_SHARE_MESSAGE = 'Unable to share this link. Please copy the URL from your browser.';

export function ShareAction({ url, title, text, label = 'Share result' }: ShareActionProps) {
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

  return (
    <div className="share-action">
      <button className="button button-secondary button-small" type="button" onClick={share}>
        {label}
      </button>
      {feedback ? (
        <p className={`share-action-feedback share-action-feedback-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
