import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreatIngestionPanel from '../components/admin/ThreatIngestionPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

vi.mock('../config', () => ({ default: 'http://localhost:8000' }));

const payload = {
    sources: [
        {
            source_id: 'cve_recent',
            source_type: 'rss',
            family: 'cve',
            display_name: 'CVE Recent',
            enabled: true,
            config: {
                feed_url: 'https://example.test/cve.xml',
                poll_interval_minutes: 60,
                severity_floor: '',
            },
            sync_status: {
                status: 'success',
                last_run_at: '2026-03-19T12:00:00Z',
                last_error: null,
                items_ingested: 4,
            },
        },
        {
            source_id: 'misp_events',
            source_type: 'misp',
            family: 'misp',
            display_name: 'MISP Events',
            enabled: false,
            config: {
                base_url: 'https://misp.example.test',
                api_key_configured: true,
                verify_tls: true,
                poll_interval_minutes: 30,
            },
            sync_status: {
                status: 'error',
                last_run_at: '2026-03-19T12:05:00Z',
                last_error: 'upstream timeout',
                items_ingested: 0,
            },
        },
    ],
};

describe('ThreatIngestionPanel', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('renders threat sources, statuses and ingestion volume', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => payload,
        });

        render(<ThreatIngestionPanel />);

        await waitFor(() => {
            expect(screen.getByText('CVE Recent')).toBeInTheDocument();
        });
        expect(screen.getByText('MISP Events')).toBeInTheDocument();
        expect(screen.getByText('upstream timeout')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(screen.getAllByText('settings.threat_ingestion_field_type')).toHaveLength(2);
        expect(screen.queryByText('api key')).not.toBeInTheDocument();
    });

    it('refreshes the source snapshot on demand', async () => {
        fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => payload,
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    sources: [
                        {
                            ...payload.sources[0],
                            sync_status: {
                                ...payload.sources[0].sync_status,
                                items_ingested: 5,
                            },
                        },
                    ],
                }),
            });

        const user = userEvent.setup();
        render(<ThreatIngestionPanel />);

        await screen.findByText('CVE Recent');
        await user.click(screen.getByRole('button', { name: 'settings.threat_ingestion_refresh' }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    });
});
