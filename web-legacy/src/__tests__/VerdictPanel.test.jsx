import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerdictPanel from '../components/dashboard/VerdictPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, params) => {
            if (params) return `${key}:${JSON.stringify(params)}`;
            return key;
        },
    }),
}));

const makeSummary = (verdict, risk_sources = 0, total_sources = 5) => ({
    verdict,
    risk_sources,
    total_sources,
});

describe('VerdictPanel', () => {
    it('renders nothing when summary is null', () => {
        const { container } = render(
            <VerdictPanel target="8.8.8.8" type="ip" summary={null} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders SAFE verdict', () => {
        render(
            <VerdictPanel target="8.8.8.8" type="ip" summary={makeSummary('SAFE')} />
        );
        expect(screen.getByText('verdict.safe')).toBeDefined();
    });

    it('renders HIGH RISK verdict', () => {
        render(
            <VerdictPanel target="1.2.3.4" type="ip" summary={makeSummary('HIGH RISK', 3)} />
        );
        expect(screen.getByText('verdict.risk')).toBeDefined();
    });

    it('renders SUSPICIOUS verdict', () => {
        render(
            <VerdictPanel target="evil.com" type="domain" summary={makeSummary('SUSPICIOUS', 1)} />
        );
        expect(screen.getByText('verdict.susp')).toBeDefined();
    });

    it('displays the target', () => {
        render(
            <VerdictPanel target="8.8.8.8" type="ip" summary={makeSummary('SAFE')} />
        );
        expect(screen.getByText('8.8.8.8')).toBeDefined();
    });

    it('displays the type badge', () => {
        render(
            <VerdictPanel target="8.8.8.8" type="ip" summary={makeSummary('SAFE')} />
        );
        expect(screen.getByText('ip')).toBeDefined();
    });
});
