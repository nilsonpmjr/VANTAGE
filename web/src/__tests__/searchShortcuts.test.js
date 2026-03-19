import { describe, expect, it } from 'vitest';
import { shouldHandleSearchShortcut } from '../utils/searchShortcuts';

describe('shouldHandleSearchShortcut', () => {
    it('accepts ctrl+l only on the home page', () => {
        expect(shouldHandleSearchShortcut('home', { key: 'l', ctrlKey: true, metaKey: false })).toBe(true);
        expect(shouldHandleSearchShortcut('dashboard', { key: 'l', ctrlKey: true, metaKey: false })).toBe(false);
        expect(shouldHandleSearchShortcut('feed', { key: 'l', ctrlKey: true, metaKey: false })).toBe(false);
    });

    it('ignores unrelated shortcuts and keys', () => {
        expect(shouldHandleSearchShortcut('home', { key: 'k', ctrlKey: true, metaKey: false })).toBe(false);
        expect(shouldHandleSearchShortcut('home', { key: 'l', ctrlKey: false, metaKey: false })).toBe(false);
    });
});
