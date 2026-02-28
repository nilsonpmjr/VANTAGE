export const t = (key, lang = 'pt') => {
    const keys = key.split('.');
    let dict = translations[lang] || translations['pt'];
    let result = dict;
    for (const k of keys) {
        if (result && result[k]) {
            result = result[k];
        } else {
            // fallback to pt
            result = translations['pt'];
            for (const fallbackKey of keys) {
                if (result && result[fallbackKey]) {
                    result = result[fallbackKey];
                } else {
                    return key;
                }
            }
            return result === translations['pt'] ? key : result;
        }
    }
    return result;
};

const translations = {
    pt: {
        app: {
            title: 'Threat Intelligence Hub',
            services: 'Serviços Integrados',
            scanning: 'Consultando múltiplas fontes de inteligência...',
            summary: 'Resumo',
            error: 'Erro:',
            download: 'Baixar Relatório (PDF)',
            loading: 'Carregando Segurança...'
        },
        sidebar: {
            menu: 'Menu',
            home: 'Home',
            dashboard: 'Dashboard',
            settings: 'Configurações',
            profile: 'Meu Perfil',
            logout: 'Sair'
        },
        dashboard: {
            title: 'Dashboard Gerencial',
            subtitle: 'Métricas de Inteligência e Escaneamentos do SOC.',
            total_scans: 'Total de Escaneamentos',
            threats: 'Ameaças Detectadas',
            proportion: 'Proporção de Casos (Veredito)',
            no_data: 'Sem dados suficientes.',
            top_artifacts: 'Top 5 Artefatos Mais Perigosos/Consultados',
            artifact: 'ARTEFATO',
            type: 'TIPO',
            searches: 'PESQUISAS',
            last_risk: 'ÚLTIMO RISCO',
            no_artifacts: 'Nenhum artefato registrado.',
            recent_history: 'Histórico Recente de Buscas',
            analyst: 'ANALISTA',
            datetime: 'DATA / HORA',
            verdict: 'VEREDITO',
            no_history: 'Nenhuma busca recente registrada.',
            sys: 'Sistema'
        },
        settings: {
            title: 'Configurações',
            subtitle: 'Gerenciamento de contas, acessos e integrações globais.',
            users: 'Usuários do Sistema',
            new_user: 'Novo Usuário',
            save: 'Salvar Usuário',
            cancel: 'Cancelar',
            edit: 'Editar',
            suspend: 'Suspender',
            activate: 'Ativar',
            name: 'Nome',
            user: 'Usuário',
            role: 'Perfil',
            status: 'Status',
            actions: 'Ações',
            search: 'Pesquisar usuários...',
            admin: 'Administrador SOC',
            manager: 'Gerente (Leitura)',
            tech: 'Analista (API Only)',
            pass_placeholder: 'Mantenha em branco para não alterar',
            suspended: 'Suspenso',
            active: 'Ativo'
        },
        profile: {
            title: 'Meu Perfil',
            subtitle: 'Gerencie suas preferências, senha e foto de exibição.',
            photo: 'Foto de Perfil',
            photo_sub: 'Clique na imagem para alterar. Máximo 1MB (JPG/PNG).',
            lang: 'Idioma Principal',
            lang_sub: 'Define o idioma padrão das inferências do módulo de inteligência.',
            security: 'Segurança (Senha)',
            security_sub: 'Deixe em branco se não deseja alterar sua senha.',
            new_pass: 'Nova Senha',
            confirm_pass: 'Confirmar Nova Senha',
            save: 'Salvar Preferências',
            success: 'Preferências salvas com sucesso! Recarregando...'
        }
    },
    en: {
        app: {
            title: 'Threat Intelligence Hub',
            services: 'Integrated Services',
            scanning: 'Scanning multiple intelligence sources...',
            summary: 'Summary',
            error: 'Error:',
            download: 'Download Report (PDF)',
            loading: 'Loading Security...'
        },
        sidebar: {
            menu: 'Menu',
            home: 'Home',
            dashboard: 'Dashboard',
            settings: 'Settings',
            profile: 'My Profile',
            logout: 'Logout'
        },
        dashboard: {
            title: 'Manager Dashboard',
            subtitle: 'SOC Intelligence and Scanning Metrics.',
            total_scans: 'Total Scans',
            threats: 'Threats Detected',
            proportion: 'Case Proportion (Verdict)',
            no_data: 'Not enough data.',
            top_artifacts: 'Top 5 Most Dangerous/Queried Artifacts',
            artifact: 'ARTIFACT',
            type: 'TYPE',
            searches: 'SEARCHES',
            last_risk: 'LAST RISK',
            no_artifacts: 'No artifacts recorded.',
            recent_history: 'Recent Search History',
            analyst: 'ANALYST',
            datetime: 'DATE / TIME',
            verdict: 'VERDICT',
            no_history: 'No recent searches recorded.',
            sys: 'System'
        },
        settings: {
            title: 'Settings',
            subtitle: 'Account management, access, and global integrations.',
            users: 'System Users',
            new_user: 'New User',
            save: 'Save User',
            cancel: 'Cancel',
            edit: 'Edit',
            suspend: 'Suspend',
            activate: 'Activate',
            name: 'Name',
            user: 'Username',
            role: 'Role',
            status: 'Status',
            actions: 'Actions',
            search: 'Search users...',
            admin: 'SOC Administrator',
            manager: 'Manager (Read-only)',
            tech: 'Analyst (API Only)',
            pass_placeholder: 'Leave blank to keep current',
            suspended: 'Suspended',
            active: 'Active'
        },
        profile: {
            title: 'My Profile',
            subtitle: 'Manage your preferences, password, and display photo.',
            photo: 'Profile Photo',
            photo_sub: 'Click image to change. Max 1MB (JPG/PNG).',
            lang: 'Primary Language',
            lang_sub: 'Sets the default language for intelligence module inferences.',
            security: 'Security (Password)',
            security_sub: 'Leave blank if you do not wish to change your password.',
            new_pass: 'New Password',
            confirm_pass: 'Confirm New Password',
            save: 'Save Preferences',
            success: 'Preferences saved successfully! Reloading...'
        }
    },
    es: {
        app: {
            title: 'Centro de Inteligencia de Amenazas',
            services: 'Servicios Integrados',
            scanning: 'Consultando múltiples fuentes de inteligencia...',
            summary: 'Resumen',
            error: 'Error:',
            download: 'Descargar Informe (PDF)',
            loading: 'Cargando Seguridad...'
        },
        sidebar: {
            menu: 'Menú',
            home: 'Inicio',
            dashboard: 'Panel',
            settings: 'Configuraciones',
            profile: 'Mi Perfil',
            logout: 'Cerrar Sesión'
        },
        dashboard: {
            title: 'Panel Gerencial',
            subtitle: 'Métricas de Inteligencia y Escaneos del SOC.',
            total_scans: 'Total de Escaneos',
            threats: 'Amenazas Detectadas',
            proportion: 'Proporción de Casos (Veredicto)',
            no_data: 'Sin datos suficientes.',
            top_artifacts: 'Top 5 Artefactos Más Peligrosos/Consultados',
            artifact: 'ARTEFACTO',
            type: 'TIPO',
            searches: 'BÚSQUEDAS',
            last_risk: 'ÚLTIMO RIESGO',
            no_artifacts: 'No hay artefactos registrados.',
            recent_history: 'Historial Reciente de Búsquedas',
            analyst: 'ANALISTA',
            datetime: 'FECHA / HORA',
            verdict: 'VEREDICTO',
            no_history: 'No hay búsquedas recientes registradas.',
            sys: 'Sistema'
        },
        settings: {
            title: 'Configuraciones',
            subtitle: 'Administración de cuentas, accesos e integraciones globales.',
            users: 'Usuarios del Sistema',
            new_user: 'Nuevo Usuario',
            save: 'Guardar Usuario',
            cancel: 'Cancelar',
            edit: 'Editar',
            suspend: 'Suspender',
            activate: 'Activar',
            name: 'Nombre',
            user: 'Usuario',
            role: 'Perfil',
            status: 'Estado',
            actions: 'Acciones',
            search: 'Buscar usuarios...',
            admin: 'Administrador SOC',
            manager: 'Gerente (Lectura)',
            tech: 'Analista (Solo API)',
            pass_placeholder: 'Dejar en blanco para no modificar',
            suspended: 'Suspendido',
            active: 'Activo'
        },
        profile: {
            title: 'Mi Perfil',
            subtitle: 'Administra tus preferencias, contraseña y foto de perfil.',
            photo: 'Foto de Perfil',
            photo_sub: 'Haz clic en la imagen para cambiarla. Máx 1MB (JPG/PNG).',
            lang: 'Idioma Principal',
            lang_sub: 'Define el idioma predeterminado para las inferencias del módulo.',
            security: 'Seguridad (Contraseña)',
            security_sub: 'Déjala en blanco si no deseas cambiar tu contraseña.',
            new_pass: 'Nueva Contraseña',
            confirm_pass: 'Confirmar Nueva Contraseña',
            save: 'Guardar Preferencias',
            success: '¡Preferencias guardadas con éxito! Recargando...'
        }
    }
};
