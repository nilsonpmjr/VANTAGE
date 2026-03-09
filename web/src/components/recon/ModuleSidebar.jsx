import React from 'react';
import { Loader2, Check, X, Radar } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ModuleSidebar({
    modules,
    selectedModules,
    onToggle,
    progress,
    scanning,
    activeModule,
    onSelectModule,
    attackSurfaceReady,
    onSelectAttackSurface,
    activeView,
}) {
    const { t } = useTranslation();

    const getModuleStatus = (name) => {
        const p = progress[name];
        if (!p) return 'idle';
        return p.status; // 'running' | 'done' | 'error'
    };

    return (
        <aside style={{
            width: '200px',
            flexShrink: 0,
            borderRight: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1rem 0',
            gap: '0.25rem',
        }}>
            <p style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                padding: '0 1rem',
                marginBottom: '0.5rem',
            }}>
                {t('recon.modules_label')}
            </p>

            {modules.map((mod) => {
                const isSelected = selectedModules.includes(mod.name);
                const status = getModuleStatus(mod.name);
                const isActive = activeView === 'module' && activeModule === mod.name;

                return (
                    <button
                        key={mod.name}
                        onClick={() => {
                            if (!scanning) onToggle(mod.name);
                            if (progress[mod.name]) onSelectModule(mod.name);
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            padding: '0.6rem 1rem',
                            background: isActive ? 'var(--accent-glow)' : 'transparent',
                            border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
                            borderRadius: 'var(--radius-md)',
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.875rem',
                            transition: 'all 0.15s',
                            marginLeft: '0.5rem',
                            marginRight: '0.5rem',
                        }}
                        onMouseOver={(e) => {
                            if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                        }}
                        onMouseOut={(e) => {
                            if (!isActive) e.currentTarget.style.background = 'transparent';
                        }}
                        title={mod.display_name}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{
                                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                                background: isSelected ? 'var(--primary)' : 'var(--text-muted)',
                                opacity: isSelected ? 1 : 0.4,
                            }} />
                            {mod.display_name}
                        </span>

                        <span style={{ flexShrink: 0 }}>
                            {status === 'running' && (
                                <Loader2 size={13} className="spin" style={{ color: 'var(--primary)' }} />
                            )}
                            {status === 'done' && (
                                <Check size={13} style={{ color: 'var(--green)' }} />
                            )}
                            {status === 'error' && (
                                <X size={13} style={{ color: 'var(--red)' }} />
                            )}
                        </span>
                    </button>
                );
            })}

            {attackSurfaceReady && (
                <>
                    <div style={{ margin: '0.75rem 1rem 0.5rem', borderTop: '1px solid var(--glass-border)' }} />
                    <button
                        onClick={onSelectAttackSurface}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.6rem 1rem',
                            background: activeView === 'surface' ? 'var(--accent-glow)' : 'transparent',
                            border: activeView === 'surface' ? '1px solid var(--accent-border)' : '1px solid transparent',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            transition: 'all 0.15s',
                            marginLeft: '0.5rem',
                            marginRight: '0.5rem',
                        }}
                        onMouseOver={(e) => {
                            if (activeView !== 'surface') e.currentTarget.style.background = 'rgba(56,189,248,0.08)';
                        }}
                        onMouseOut={(e) => {
                            if (activeView !== 'surface') e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <Radar size={14} />
                        {t('recon.attack_surface')}
                    </button>
                </>
            )}
        </aside>
    );
}
