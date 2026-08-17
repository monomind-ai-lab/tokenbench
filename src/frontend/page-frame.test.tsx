import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { previewRoutes } from '../preview/route-manifest';
import { PageFrame } from './page-frame';

const route = previewRoutes.find((candidate) => candidate.id === 'home');

if (!route) throw new Error('Expected the home preview route');

describe('PageFrame', () => {
  it('renders one shared header, main target, and footer from manifest shell data', () => {
    render(<PageFrame shell={route.shell}><h1>React preview</h1></PageFrame>);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', route.shell.skipLinkTarget);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: route.shell.skipLinkLabel })).toHaveAttribute('href', `#${route.shell.skipLinkTarget}`);
  });
});
