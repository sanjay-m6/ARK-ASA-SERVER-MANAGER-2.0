import { create } from 'zustand';

export type GameMode = 'ASA' | 'ASE';

interface GameStore {
    activeGame: GameMode;
    setActiveGame: (game: GameMode) => void;
}

const stored = localStorage.getItem('ark-active-game') as GameMode | null;

export const useGameStore = create<GameStore>((set) => ({
    activeGame: stored === 'ASE' ? 'ASE' : 'ASA',
    setActiveGame: (game) => {
        localStorage.setItem('ark-active-game', game);
        set({ activeGame: game });
    },
}));
