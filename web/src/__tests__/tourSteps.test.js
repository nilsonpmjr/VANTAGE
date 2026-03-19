import { describe, expect, it } from 'vitest';
import TOUR_STEPS from '../tour/tourSteps';

describe('tourSteps', () => {
    it('covers the relevant sidebar pages of the current product shell', () => {
        const targets = TOUR_STEPS.map((step) => step.target);

        expect(targets).toContain('sidebar-recon');
        expect(targets).toContain('sidebar-watchlist');
        expect(targets).toContain('sidebar-dashboard');
    });
});
