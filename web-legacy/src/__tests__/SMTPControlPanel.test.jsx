import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SMTPControlPanel from '../components/admin/SMTPControlPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, params) => {
            if (params?.email) return `${key}:${params.email}`;
            return key;
        },
    }),
}));

vi.mock('../config', () => ({ default: 'http://localhost:8000' }));

describe('SMTPControlPanel', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('loads smtp config and renders effective values', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                host: { value: 'smtp.control.local', source: 'persisted' },
                port: { value: 2525, source: 'persisted' },
                username: { value: 'mailer', source: 'env' },
                from: { value: 'noreply@soc.local', source: 'default' },
                tls: { value: true, source: 'persisted' },
                password: { configured: true, masked: '********', source: 'persisted' },
            }),
        });

        render(<SMTPControlPanel />);

        await waitFor(() => {
            expect(screen.getByDisplayValue('smtp.control.local')).toBeInTheDocument();
        });
        expect(screen.getByText('settings.smtp_state_title')).toBeInTheDocument();
        expect(screen.getByText('********')).toBeInTheDocument();
    });

    it('submits save without sending password when field is blank', async () => {
        fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    host: { value: 'smtp.control.local', source: 'persisted' },
                    port: { value: 2525, source: 'persisted' },
                    username: { value: 'mailer', source: 'persisted' },
                    from: { value: 'noreply@soc.local', source: 'persisted' },
                    tls: { value: true, source: 'persisted' },
                    password: { configured: true, masked: '********', source: 'persisted' },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    host: { value: 'smtp.changed.local', source: 'persisted' },
                    port: { value: 2525, source: 'persisted' },
                    username: { value: 'mailer', source: 'persisted' },
                    from: { value: 'noreply@soc.local', source: 'persisted' },
                    tls: { value: true, source: 'persisted' },
                    password: { configured: true, masked: '********', source: 'persisted' },
                }),
            });

        render(<SMTPControlPanel />);

        const hostInput = await screen.findByDisplayValue('smtp.control.local');
        fireEvent.change(hostInput, { target: { value: 'smtp.changed.local' } });
        fireEvent.submit(hostInput.closest('form'));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

        const [, request] = fetch.mock.calls[1];
        const payload = JSON.parse(request.body);
        expect(payload.host).toBe('smtp.changed.local');
        expect(payload.password).toBeUndefined();
        expect(request.credentials).toBe('include');
    });
});
