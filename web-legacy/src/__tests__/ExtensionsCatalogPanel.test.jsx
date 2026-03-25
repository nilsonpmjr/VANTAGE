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
    search_roots: [
        { scope: 'core', label: 'bundled-core', repository_visibility: 'public' },
        { scope: 'local', label: 'local-plugins', repository_visibility: 'public' },
    ],
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
            distributionTier: 'core',
            repositoryVisibility: 'public',
            updateChannel: 'bundled',
            ownershipBoundary: 'core_team',
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
            distributionTier: 'core',
            repositoryVisibility: 'public',
            updateChannel: 'bundled',
            ownershipBoundary: 'core_team',
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
            distributionTier: 'core',
            repositoryVisibility: 'public',
            updateChannel: 'bundled',
            ownershipBoundary: 'core_team',
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
        expect(screen.getByText('settings.extensions_catalog_search_roots')).toBeInTheDocument();
        expect(screen.getAllByText('settings.extensions_catalog_field_distribution_tier')).toHaveLength(3);
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

    it('filters the catalog by distribution tier', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                ...payload,
                items: [
                    ...payload.items,
                    {
                        key: 'premium-hunting',
                        name: 'Premium Hunting',
                        kind: 'premium_feature',
                        premiumFeatureType: 'hunting_provider',
                        version: '0.1.0',
                        author: 'VANTAGE Premium',
                        license: 'Commercial',
                        compatibleCore: '1.x',
                        status: 'enabled',
                        capabilities: ['hunting'],
                        permissions: ['license.local'],
                        entrypoint: 'premium.hunting',
                        distributionTier: 'premium',
                        repositoryVisibility: 'private',
                        updateChannel: 'licensed',
                        ownershipBoundary: 'vantage_premium',
                        huntingArtifactTypes: ['alias', 'email', 'username'],
                        providerScope: ['identity', 'social'],
                        requiredSecrets: ['license.local'],
                        isolationMode: 'isolated_container',
                        requiresKali: false,
                        executionProfile: {
                            operationalRisk: 'medium',
                            performanceProfile: 'balanced',
                        },
                        source: 'premium',
                        builtin: false,
                        delivery: 'licensed_package',
                        productSurface: ['hunting'],
                        errors: [],
                    },
                    {
                        key: 'premium-exposure',
                        name: 'Premium Exposure',
                        kind: 'premium_feature',
                        premiumFeatureType: 'exposure_provider',
                        version: '0.1.0',
                        author: 'VANTAGE Premium',
                        license: 'Commercial',
                        compatibleCore: '1.x',
                        status: 'enabled',
                        capabilities: ['credential', 'brand'],
                        permissions: ['license.local'],
                        entrypoint: 'premium.exposure',
                        distributionTier: 'premium',
                        repositoryVisibility: 'private',
                        updateChannel: 'licensed',
                        ownershipBoundary: 'vantage_premium',
                        exposureAssetTypes: ['brand_keyword', 'domain'],
                        providerScope: ['brand', 'credential'],
                        requiredSecrets: ['license.local'],
                        recommendedSchedule: 'daily',
                        source: 'premium',
                        builtin: false,
                        delivery: 'licensed_package',
                        productSurface: ['brand', 'credential'],
                        errors: [],
                    },
                ],
            }),
        });

        const user = userEvent.setup();
        render(<ExtensionsCatalogPanel />);

        await screen.findByText('Premium Hunting');
        expect(screen.getAllByText('settings.extensions_catalog_field_premium_feature_type')).toHaveLength(2);
        expect(screen.getByText('settings.extensions_catalog_field_hunting_artifact_types')).toBeInTheDocument();
        expect(screen.getByText('settings.extensions_catalog_field_operational_risk')).toBeInTheDocument();
        expect(screen.getByText('settings.extensions_catalog_exposure')).toBeInTheDocument();
        expect(screen.getByText('settings.extensions_catalog_field_exposure_asset_types')).toBeInTheDocument();
        expect(screen.getByText('settings.extensions_catalog_field_recommended_schedule')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'settings.extensions_catalog_filter_premium' }));

        expect(screen.getByText('Premium Hunting')).toBeInTheDocument();
        expect(screen.getByText('Premium Exposure')).toBeInTheDocument();
        expect(screen.queryByText('VANTAGE Brand Pack')).not.toBeInTheDocument();
    });
});
