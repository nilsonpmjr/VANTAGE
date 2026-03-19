import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBar from '../components/dashboard/SearchBar';

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
        i18n: { changeLanguage: vi.fn() },
    }),
}));

describe('SearchBar', () => {
    it('renders the search input', () => {
        render(<SearchBar onSearch={vi.fn()} loading={false} />);
        expect(screen.getByRole('textbox')).toBeDefined();
    });

    it('calls onSearch with trimmed query on submit', async () => {
        const onSearch = vi.fn();
        const user = userEvent.setup();
        render(<SearchBar onSearch={onSearch} loading={false} />);

        const input = screen.getByRole('textbox');
        await user.type(input, '  8.8.8.8  ');
        fireEvent.submit(input.closest('form'));

        expect(onSearch).toHaveBeenCalledWith('8.8.8.8');
    });

    it('does not call onSearch for empty input', async () => {
        const onSearch = vi.fn();
        render(<SearchBar onSearch={onSearch} loading={false} />);
        fireEvent.submit(screen.getByRole('textbox').closest('form'));
        expect(onSearch).not.toHaveBeenCalled();
    });

    it('disables input while loading', () => {
        render(<SearchBar onSearch={vi.fn()} loading={true} />);
        expect(screen.getByRole('textbox').disabled).toBe(true);
    });

    it('focuses the input when focusSignal changes', async () => {
        const { rerender } = render(<SearchBar onSearch={vi.fn()} loading={false} focusSignal={0} />);
        const input = screen.getByRole('textbox');

        expect(document.activeElement).not.toBe(input);

        rerender(<SearchBar onSearch={vi.fn()} loading={false} focusSignal={1} />);

        expect(document.activeElement).toBe(input);
    });
});
