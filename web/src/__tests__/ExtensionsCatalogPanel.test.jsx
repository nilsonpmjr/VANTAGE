import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExtensionsCatalogPanel from '../components/admin/ExtensionsCatalogPanel';

const mockT = (key) => key;

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: mockT,
    }),
}));

vi.mock('../config', () => ({ default: 'http://localhost:8000' }));

const payload = {
    core_version: '1.0.0',
    items: [
        {
            key: 'brand-vantage',
            name: 'VANTAGE Brand Pack',
            kind: 'brand_pack',
            version: '1.0.0',
            author: 'VANTAGE Core',
            license: 'AGPL-3.0-or-later',
            compatibleCore: '1.x',
            status: 'enabled',
            capabilities: ['dark', 'light'],
            permissions: [],
            entrypoint: null,
            source: 'local',
            builtin: true,
            themes: ['dark', 'light'],
            sourceFileCount: 3,
            publicAssetCount: 4,
            errors: [],
        },
        {
            key: 'recon-builtins',
            name: 'Built-in Recon Modules',
            kind: 'recon_module',
            version: '1.0.0',
            author: 'VANTAGE Core',
            license: 'AGPL-3.0-or-later',
            compatibleCore: '1.x',
            status: 'enabled',
            capabilities: ['history', 'schedule'],
            permissions: ['recon.read'],
            entrypoint: 'backend.recon.modules',
            source: 'core',
            builtin: true,
            moduleCount: 8,
            availableModuleCount: 6,
            supportedTargetTypes: ['both', 'domain'],
            requiredBinaries: ['nmap', 'subfinder'],
            errors: [],
        },
        {
            key: 'report-exporter-pdf',
            name: 'PDF Report Exporter',
            kind: 'report_exporter',
            version: '1.0.0',
            author: 'VANTAGE Core',
            license: 'AGPL-3.0-or-later',
            compatibleCore: '1.x',
            status: 'incompatible',
            capabilities: ['pdf'],
            permissions: [],
            entrypoint: 'web.src.utils.pdfGenerator:generatePDFReport',
            source: 'core',
            builtin: true,
            formats: ['pdf'],
            delivery: 'download',
            exportFunction: 'generatePDFReport',
            sourceFileCount: 1,
            errors: ['core_version_mismatch'],
        },
    ],
};

describe('ExtensionsCatalogPanel', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('renders extension catalog metadata and compatibility signals', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => payload,
        });

        render(<ExtensionsCatalogPanel />);

        await waitFor(() => {
            expect(screen.getByText('VANTAGE Brand Pack')).toBeInTheDocument();
        });

        expect(screen.getByText('Built-in Recon Modules')).toBeInTheDocument();
        expect(screen.getByText('PDF Report Exporter')).toBeInTheDocument();
        expect(screen.getByText('core_version_mismatch')).toBeInTheDocument();
        expect(screen.getAllByText('settings.extensions_catalog_field_key')).toHaveLength(3);
        expect(screen.getByText('settings.extensions_catalog_core_version')).toBeInTheDocument();
    });

    it('refreshes the catalog on demand', async () => {
        fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => payload,
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...payload,
                    items: payload.items.slice(0, 2),
                }),
            });

        const user = userEvent.setup();
        render(<ExtensionsCatalogPanel />);

        await screen.findByText('VANTAGE Brand Pack');
        await user.click(screen.getByRole('button', { name: 'settings.extensions_catalog_refresh' }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        expect(fetch).toHaveBeenLastCalledWith(
            'http://localhost:8000/api/admin/extensions?refresh=true',
            { credentials: 'include' },
        );
    });

    it('renders an empty state when no extensions are detected', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                core_version: '1.0.0',
                items: [],
            }),
        });

        render(<ExtensionsCatalogPanel />);

        await screen.findByText('settings.extensions_catalog_empty_title');
        expect(screen.getByText('settings.extensions_catalog_empty_body')).toBeInTheDocument();
    });

    it('renders the API error message when loading fails', async () => {
        fetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({
                detail: 'catalog_unavailable',
            }),
        });

        render(<ExtensionsCatalogPanel />);

        await screen.findByText('catalog_unavailable');
    });
});
