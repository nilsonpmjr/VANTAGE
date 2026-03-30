import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreatIngestionPanel from '../components/admin/ThreatIngestionPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, opts) => {
            if (opts) return key.replace(/\{\{(\w+)\}\}/g, (_, k) => opts[k] || '');
            return key;
        },
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
            origin: 'core',
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
            origin: 'core',
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

    it('renders threat sources in data-table with name, family and status', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => payload,
        });

        render(<ThreatIngestionPanel />);

        await waitFor(() => {
            expect(screen.getByText('CVE Recent')).toBeInTheDocument();
        });
        expect(screen.getByText('MISP Events')).toBeInTheDocument();
        // Items ingested shown in table
        expect(screen.getByText('4')).toBeInTheDocument();
        // Origin badges (core sources)
        expect(screen.getAllByText('settings.threat_ingestion_origin_core')).toHaveLength(2);
        // Status badges present
        expect(screen.getAllByText('settings.threat_ingestion_enabled').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('settings.threat_ingestion_disabled').length).toBeGreaterThanOrEqual(1);
    });

    it('refreshes the source list on demand', async () => {
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

    it('shows add source form when button is clicked', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ sources: [] }),
        });

        const user = userEvent.setup();
        render(<ThreatIngestionPanel />);

        await waitFor(() => {
            expect(screen.getByText('settings.threat_ingestion_no_sources')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: 'settings.threat_ingestion_add_source' }));
        expect(screen.getByText('settings.threat_ingestion_add_title')).toBeInTheDocument();
    });
});
