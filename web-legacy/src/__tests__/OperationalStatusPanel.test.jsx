import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OperationalStatusPanel from '../components/admin/OperationalStatusPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

vi.mock('../config', () => ({ default: 'http://localhost:8000' }));

const snapshot = {
    checked_at: '2026-03-19T12:00:00Z',
    summary: { healthy: 3, degraded: 1, error: 1 },
    services: {
        backend: {
            status: 'healthy',
            last_checked: '2026-03-19T12:00:00Z',
            error: null,
            details: { api_prefix: '/api' },
            consumption: { active_sessions: 7 },
        },
        mongodb: {
            status: 'healthy',
            last_checked: '2026-03-19T12:00:00Z',
            error: null,
            details: { ping: 'ok' },
            consumption: { latency_ms: 2 },
        },
        scheduler: {
            status: 'degraded',
            last_checked: '2026-03-19T12:00:00Z',
            error: 'Scheduler is not running',
            details: { running: false },
            consumption: { scheduled_jobs: 0 },
        },
        worker: {
            status: 'healthy',
            last_checked: '2026-03-19T12:00:00Z',
            error: null,
            details: { reported: true },
            consumption: { altered_targets: 2 },
        },
        mailer: {
            status: 'error',
            last_checked: '2026-03-19T12:00:00Z',
            error: 'SMTP is not configured',
            details: { configured: false },
            consumption: {},
        },
    },
};

describe('OperationalStatusPanel', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('renders summary and service cards from the snapshot', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => snapshot,
        });

        render(<OperationalStatusPanel />);

        await waitFor(() => {
            expect(screen.getByText('settings.operational_status_service_backend')).toBeInTheDocument();
        });
        expect(screen.getByText('settings.operational_status_service_mongodb')).toBeInTheDocument();
        expect(screen.getByText('settings.operational_status_service_scheduler')).toBeInTheDocument();
        expect(screen.getByText('settings.operational_status_service_mailer')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('refreshes the snapshot on demand', async () => {
        fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => snapshot,
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...snapshot,
                    summary: { healthy: 4, degraded: 1, error: 0 },
                }),
            });

        const user = userEvent.setup();
        render(<OperationalStatusPanel />);

        await screen.findByText('settings.operational_status_service_backend');
        await user.click(screen.getByRole('button', { name: 'settings.operational_status_refresh' }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    });
});
