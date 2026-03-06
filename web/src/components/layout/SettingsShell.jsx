import React, { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import ContextMenu from './ContextMenu';
import Breadcrumbs from './Breadcrumbs';

export default function SettingsShell({ groups, activeKey, onSelect, breadcrumbs, children }) {
    const contentRef = useRef(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        setDrawerOpen(false);
    }, [activeKey]);

    const handleSelect = (key) => {
        onSelect(key);
        setDrawerOpen(false);
    };

    const currentLabel = breadcrumbs?.[breadcrumbs.length - 1]?.label || '';

    return (
        <div className="settings-shell fade-in">
            {/* Mobile drawer backdrop */}
            <div
                className={`settings-drawer-backdrop${drawerOpen ? ' open' : ''}`}
                onClick={() => setDrawerOpen(false)}
                aria-hidden="true"
            />

            {/* Mobile top bar (hamburger + current section label) */}
            <div className="settings-mobile-bar" aria-label="Section navigation">
                <button
                    className="settings-menu-toggle"
                    onClick={() => setDrawerOpen(o => !o)}
                    aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={drawerOpen}
                >
                    {drawerOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
                <span className="settings-mobile-title">{currentLabel}</span>
            </div>

            <ContextMenu
                groups={groups}
                activeKey={activeKey}
                onSelect={handleSelect}
                drawerOpen={drawerOpen}
            />

            <div className="settings-content" ref={contentRef}>
                <Breadcrumbs items={breadcrumbs} />
                {children}
            </div>
        </div>
    );
}
