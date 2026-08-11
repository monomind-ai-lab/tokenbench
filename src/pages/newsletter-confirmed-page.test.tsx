import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewsletterConfirmedPage } from './newsletter-confirmed-page';

describe('newsletter confirmation page', () => {
  it('renders exactly one Start Exploring action that links home and no other action', () => {
    render(<NewsletterConfirmedPage />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Start Exploring');
    expect(links[0]).toHaveAttribute('href', '/');
  });

  it('does not render any button, form, or shell navigation actions', () => {
    render(<NewsletterConfirmedPage />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('publishes the confirmation heading and delivery copy without subscriber identity', () => {
    render(<NewsletterConfirmedPage />);

    expect(screen.getByRole('heading', { name: 'Your subscription is confirmed.', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Email confirmed')).toBeInTheDocument();
    expect(screen.getByText('The current TokenBench test cheatsheet will arrive by email.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('{{ contact.EMAIL }}');
  });
});
