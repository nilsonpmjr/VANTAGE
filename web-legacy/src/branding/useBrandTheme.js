import { useSyncExternalStore } from 'react';
import brand from './config';
import { getActiveTheme, getBrandAssets, subscribeTheme } from './runtime';

export default function useBrandTheme() {
    const theme = useSyncExternalStore(
        subscribeTheme,
        () => getActiveTheme(),
        () => brand.defaultTheme,
    );

    return {
        brand,
        theme,
        ...getBrandAssets(theme),
    };
}
