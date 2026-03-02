import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../components/Login';

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
        i18n: { changeLanguage: vi.fn() },
    }),
    initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// Mock AuthContext
const mockLogin = vi.fn();
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ login: mockLogin }),
}));

// Mock config
vi.mock('../config', () => ({ default: 'http://localhost:8000' }));

describe('Login', () => {
    beforeEach(() => {
        mockLogin.mockReset();
    });

    it('renders username and password inputs', () => {
        render(<Login />);
        expect(screen.getByRole('textbox')).toBeDefined(); // username
        expect(document.querySelector('input[type="password"]')).not.toBeNull();
    });

    it('renders the subtitle from i18n key', () => {
        render(<Login />);
        expect(screen.getByText('login.subtitle')).toBeDefined();
    });

    it('calls login on valid form submit', async () => {
        mockLogin.mockResolvedValueOnce(true);
        const user = userEvent.setup();
        render(<Login />);

        await user.type(screen.getByRole('textbox'), 'admin');
        await user.type(document.querySelector('input[type="password"]'), 'admin123');
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('admin', 'admin123'));
    });

    it('shows i18n error key on login failure', async () => {
        mockLogin.mockRejectedValueOnce(new Error('bad'));
        const user = userEvent.setup();
        render(<Login />);

        await user.type(screen.getByRole('textbox'), 'admin');
        await user.type(document.querySelector('input[type="password"]'), 'wrong');
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() =>
            expect(screen.getByText('login.error_credentials')).toBeDefined()
        );
    });
});
