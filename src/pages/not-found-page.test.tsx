import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotFoundPage } from './not-found-page';

describe('NotFoundPage', () => {
  it('provides six primary decision links instead of a blank route', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { name: /Page not found/i })).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Primary recovery links' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(6);
    expect(within(navigation).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(navigation).getByRole('link', { name: 'Models' })).toHaveAttribute('href', '/models/');
    expect(within(navigation).getByRole('link', { name: 'Leaderboards' })).toHaveAttribute('href', '/leaderboards/');
    expect(within(navigation).getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare/');
    expect(within(navigation).getByRole('link', { name: 'Subscribe vs API' })).toHaveAttribute('href', '/cost/');
    expect(within(navigation).getByRole('link', { name: 'Articles' })).toHaveAttribute('href', '/articles/');
  });
});
