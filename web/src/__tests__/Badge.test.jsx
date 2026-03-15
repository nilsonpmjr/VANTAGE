import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../components/ui/Badge';

describe('Badge', () => {
    it('renders the selected variant class', () => {
        render(<Badge variant="danger">Risk</Badge>);
        const badge = screen.getByText('Risk');

        expect(badge).toHaveClass('v-badge');
        expect(badge).toHaveClass('v-badge--danger');
    });
});
