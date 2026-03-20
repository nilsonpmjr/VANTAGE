import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PremiumExposurePage from '../components/exposure/PremiumExposurePage';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, params) => {
            if (typeof params?.count !== 'undefined') {
                return `${key}:${params.count}`;
            }
            if (typeof params?.schedule !== 'undefined') {
                return `${key}:${params.schedule}:${params.findings}:${params.incidents}`;
            }
            return key;
        },
    }),
}));

vi.mock('../config', () => ({ default: 'http://localhost:8000' }));

describe('PremiumExposurePage', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
            const method = options.method || 'GET';

            if (url === 'http://localhost:8000/api/exposure/providers' && method === 'GET') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        items: [
                            {
                                key: 'premium-exposure-surface-monitor',
                                name: 'Surface Monitor',
                                exposureAssetTypes: ['domain', 'subdomain', 'brand_keyword'],
                            },
                        ],
                    }),
                });
            }

            if (url === 'http://localhost:8000/api/exposure/assets' && method === 'GET') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ items: [] }),
                });
            }

            if (url === 'http://localhost:8000/api/exposure/assets' && method === 'POST') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        item: {
                            _id: 'asset-1',
                            asset_type: 'domain',
                            value: 'example.com',
                            recurrence: {
                                mode: 'daily',
                                last_status: 'never_run',
                                last_run_at: null,
                                next_run_at: null,
                            },
                        },
                    }),
                });
            }

            if (url === 'http://localhost:8000/api/exposure/assets/asset-1/scan' && method === 'POST') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        asset: {
                            _id: 'asset-1',
                            asset_type: 'domain',
                            value: 'example.com',
                            recurrence: {
                                mode: 'daily',
                                last_status: 'success',
                                last_run_at: '2026-03-20T00:00:00Z',
                                next_run_at: '2026-03-21T00:00:00Z',
                            },
                        },
                        total_results: 1,
                        items: [
                            {
                                _id: 'finding-1',
                                title: 'Suspicious brand page',
                                summary: 'A suspicious page references the monitored brand.',
                                severity: 'high',
                                external_ref: 'https://example.test/brand-vantage',
                            },
                        ],
                    }),
                });
            }

            return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('creates a monitored asset and renders it in the premium list', async () => {
        const user = userEvent.setup();
        render(<PremiumExposurePage />);

        await screen.findByText('exposure.monitored_assets_title');
        await user.type(screen.getByPlaceholderText('exposure.value_placeholder'), 'example.com');
        await user.click(screen.getByRole('button', { name: 'exposure.create_cta' }));

        await screen.findByText('example.com');
        expect(screen.getByText('Surface Monitor')).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:8000/api/exposure/assets',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
            }),
        );
    });

    it('runs a scan and displays normalized recent findings', async () => {
        const user = userEvent.setup();
        render(<PremiumExposurePage />);

        await screen.findByText('exposure.monitored_assets_title');
        await user.type(screen.getByPlaceholderText('exposure.value_placeholder'), 'example.com');
        await user.click(screen.getByRole('button', { name: 'exposure.create_cta' }));
        await screen.findByText('example.com');

        await user.click(screen.getByRole('button', { name: 'exposure.scan_cta' }));

        await waitFor(() => {
            expect(screen.getByText('Suspicious brand page')).toBeInTheDocument();
        });
        expect(screen.getByText('exposure.open_reference')).toBeInTheDocument();
    });
});
