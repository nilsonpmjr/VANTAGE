import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileInfoPanel from '../components/profile/ProfileInfoPanel';

const updateUserContext = vi.fn();

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: {
            name: 'Tech User',
            username: 'techuser',
            email: 'tech@soc.local',
            avatar_base64: '',
            recovery_email: '',
        },
        updateUserContext,
    }),
}));

vi.mock('../config', () => ({ default: 'http://localhost:8000' }));
vi.mock('../components/shared/SectionHeader', () => ({
    default: ({ title, subtitle }) => (
        <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
        </div>
    ),
}));

describe('ProfileInfoPanel', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'success' }),
        }));
        updateUserContext.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('submits normalized recovery email with profile preferences', async () => {
        render(<ProfileInfoPanel notices={null} />);

        fireEvent.change(screen.getByLabelText('profile.recovery_email'), {
            target: { value: '  Recovery@Example.com ' },
        });
        fireEvent.click(screen.getByText('profile.save'));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        const [, request] = fetch.mock.calls[0];
        const payload = JSON.parse(request.body);

        expect(payload.recovery_email).toBe('recovery@example.com');
        expect(request.credentials).toBe('include');
        expect(updateUserContext).toHaveBeenCalledWith(expect.objectContaining({
            recovery_email: 'recovery@example.com',
        }));
    });
});
