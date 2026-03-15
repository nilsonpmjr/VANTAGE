import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Button from '../components/ui/Button';

describe('Button', () => {
    it('renders the primary variant by default', () => {
        render(<Button>Save</Button>);
        const button = screen.getByRole('button', { name: 'Save' });

        expect(button).toHaveClass('v-btn');
        expect(button).toHaveClass('v-btn--primary');
        expect(button).toHaveClass('v-btn--md');
    });

    it('disables the button while loading', () => {
        render(<Button loading>Loading</Button>);
        const button = screen.getByRole('button', { name: 'Loading' });

        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('forwards click events when enabled', async () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Run</Button>);

        screen.getByRole('button', { name: 'Run' }).click();
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
