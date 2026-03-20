import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PremiumHuntingPage from '../components/hunting/PremiumHuntingPage';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, params) => {
            if (params?.query) {
                return `${key}:${params.query}:${params.count ?? ''}`;
            }
            if (params?.artifact) {
                return `${key}:${params.artifact}:${params.count ?? ''}`;
            }
            if (typeof params?.count !== 'undefined') {
                return `${key}:${params.count}`;
            }
            return key;
        },
    }),
}));

vi.mock('../config', () => ({ default: 'http://localhost:8000' }));

const searchResultPayload = {
    query: {
        artifact_type: 'username',
        query: 'example',
    },
    total_results: 1,
    items: [
        {
            provider: {
                key: 'premium-hunting-sherlock',
                name: 'Sherlock',
            },
            query: {
                artifact_type: 'username',
                query: 'example',
            },
            status: 'ok',
            error: null,
            results: [
                {
                    provider_key: 'premium-hunting-sherlock',
                    external_ref: 'https://github.com/example',
                    data: {
                        title: 'github profile match',
                        summary: 'Potential profile match found on github.',
                        confidence: 0.7,
                        attributes: {
                            platform: 'github',
                            claimed: true,
                        },
                    },
                },
            ],
        },
    ],
};

describe('PremiumHuntingPage', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('renders search form and displays flat result cards', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => searchResultPayload,
        });

        const user = userEvent.setup();
        render(<PremiumHuntingPage />);

        expect(screen.getByText('hunting.page_title')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('hunting.query_placeholder')).toBeInTheDocument();

        await user.type(screen.getByPlaceholderText('hunting.query_placeholder'), 'example');
        await user.click(screen.getByRole('button', { name: 'hunting.search_cta' }));

        await screen.findByText('github');
        expect(screen.getByText('Sherlock')).toBeInTheDocument();
        expect(screen.getByText('hunting.claimed')).toBeInTheDocument();
        expect(screen.getByText('hunting.open_profile')).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:8000/api/hunting/search',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
            }),
        );
    });

    it('shows unsupported provider notice without crashing', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                query: {
                    artifact_type: 'email',
                    query: 'person@example.com',
                },
                total_results: 0,
                items: [
                    {
                        provider: {
                            key: 'premium-hunting-sherlock',
                            name: 'Sherlock',
                        },
                        query: {
                            artifact_type: 'email',
                            query: 'person@example.com',
                        },
                        status: 'unsupported',
                        error: 'unsupported_artifact_type:email',
                        results: [],
                    },
                ],
            }),
        });

        const user = userEvent.setup();
        render(<PremiumHuntingPage />);

        await user.selectOptions(screen.getByRole('combobox'), 'email');
        await user.type(screen.getByPlaceholderText('hunting.query_placeholder'), 'person@example.com');
        await user.click(screen.getByRole('button', { name: 'hunting.search_cta' }));

        await waitFor(() => {
            const notice = document.querySelector('.hunting-provider-notice');
            expect(notice).toBeTruthy();
            expect(notice.textContent).toContain('unsupported_artifact_type:email');
        });
    });

    it('shows empty state before any search is executed', () => {
        render(<PremiumHuntingPage />);

        expect(screen.getByText('hunting.results_empty_state')).toBeInTheDocument();
    });
});
