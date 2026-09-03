import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('calls its handler when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Check now</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Check now' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('cannot be clicked while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} isLoading>
        Check now
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    // Disabling is what prevents a double submission; a debounce would still
    // let the first two clicks through.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps its label readable while loading', () => {
    render(<Button isLoading>Check now</Button>);

    // The spinner replaces the icon, not the text: a button that loses its
    // label mid-action leaves the user unsure what they pressed.
    expect(screen.getByRole('button', { name: 'Check now' })).toBeInTheDocument();
  });
});
