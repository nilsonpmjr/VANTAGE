import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function ContextMenu({ groups, activeKey, onSelect, drawerOpen }) {
    const [collapsed, setCollapsed] = useState({});

    const toggle = (groupKey) => {
        setCollapsed(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
    };

    return (
        <nav
            id="settings-nav-menu"
            className={`settings-menu${drawerOpen ? ' drawer-open' : ''}`}
            aria-label="Context menu"
        >
            {groups.map((group) => {
                const isCollapsed = collapsed[group.key] === true;
                const hasChildren = group.items && group.items.length > 0;

                return (
                    <div className="ctx-menu-group" key={group.key}>
                        {hasChildren ? (
                            <button
                                className="ctx-menu-group-title"
                                onClick={() => toggle(group.key)}
                                type="button"
                                aria-expanded={!isCollapsed}
                            >
                                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                {group.label}
                            </button>
                        ) : (
                            <button
                                className={`ctx-menu-item${activeKey === group.key ? ' active' : ''}`}
                                onClick={() => onSelect(group.key)}
                                type="button"
                                aria-current={activeKey === group.key ? 'page' : undefined}
                            >
                                {group.icon}
                                {group.label}
                            </button>
                        )}

                        {hasChildren && !isCollapsed && (
                            <div className="ctx-menu-items" role="group">
                                {group.items.map((item) => (
                                    <button
                                        key={item.key}
                                        className={`ctx-menu-item${activeKey === item.key ? ' active' : ''}`}
                                        onClick={() => onSelect(item.key)}
                                        type="button"
                                        aria-current={activeKey === item.key ? 'page' : undefined}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
