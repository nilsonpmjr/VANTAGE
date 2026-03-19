import { describe, expect, it } from 'vitest';
import TOUR_STEPS from '../tour/tourSteps';

describe('tourSteps', () => {
    it('covers the final sidebar map and search surface of the current product shell', () => {
        const targets = TOUR_STEPS.map((step) => step.target);

        expect(targets).toContain('search-bar');
        expect(targets).toContain('sidebar-home');
        expect(targets).toContain('sidebar-feed');
        expect(targets).toContain('sidebar-recon');
        expect(targets).toContain('sidebar-watchlist');
        expect(targets).toContain('sidebar-dashboard');
        expect(targets).toContain('sidebar-settings');
        expect(targets).toContain('sidebar-profile');
    });
});
