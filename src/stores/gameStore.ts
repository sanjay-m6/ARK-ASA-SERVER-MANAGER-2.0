import { create } from 'zustand';

export type GameMode = 'ASA' | 'ASE';

interface GameStore {
    activeGame: GameMode;
    setActiveGame: (game: GameMode) => void;
    isSidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
    showAseMode: boolean;
    setShowAseMode: (show: boolean) => void;
    /** Skip the ASA/ASE picker on startup and open the last chosen game directly */
    rememberGame: boolean;
    setRememberGame: (remember: boolean) => void;
}

const stored = localStorage.getItem('ark-active-game') as GameMode | null;
const storedCollapsed = localStorage.getItem('ark-sidebar-collapsed') === 'true';
const storedShowAse = localStorage.getItem('ark-show-ase-mode');
const storedRemember = localStorage.getItem('ark-remember-game') === 'true';

export const useGameStore = create<GameStore>((set) => ({
    activeGame: stored === 'ASE' ? 'ASE' : 'ASA',
    setActiveGame: (game) => {
        localStorage.setItem('ark-active-game', game);
        set({ activeGame: game });
    },
    isSidebarCollapsed: storedCollapsed,
    setSidebarCollapsed: (collapsed) => {
        localStorage.setItem('ark-sidebar-collapsed', collapsed ? 'true' : 'false');
        set({ isSidebarCollapsed: collapsed });
    },
    showAseMode: storedShowAse === 'true' || stored === 'ASE',
    setShowAseMode: (show) => {
        localStorage.setItem('ark-show-ase-mode', show ? 'true' : 'false');
        set({ showAseMode: show });
    },
    // Only meaningful once a game has been chosen at least once
    rememberGame: storedRemember && stored !== null,
    setRememberGame: (remember) => {
        localStorage.setItem('ark-remember-game', remember ? 'true' : 'false');
        set({ rememberGame: remember });
    },
}));
