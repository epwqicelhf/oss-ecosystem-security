import { create } from 'zustand';

interface Action {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  data?: unknown;
  undo?: () => void;
}

interface HistoryState {
  actions: Action[];
  currentIndex: number;
  isRecording: boolean;
  addAction: (action: Omit<Action, 'id' | 'timestamp'>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  toggleRecording: () => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  actions: [],
  currentIndex: -1,
  isRecording: true,

  addAction: (action) => {
    const { isRecording, actions, currentIndex } = get();
    if (!isRecording) return;

    const newAction: Action = {
      ...action,
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };

    const newActions = actions.slice(0, currentIndex + 1);
    newActions.push(newAction);

    set({
      actions: newActions.slice(-100),
      currentIndex: Math.min(newActions.length - 1, 99)
    });
  },

  undo: () => {
    const { currentIndex, actions } = get();
    if (currentIndex < 0) return;

    const action = actions[currentIndex];
    if (action.undo) action.undo();

    set({ currentIndex: currentIndex - 1 });
  },

  redo: () => {
    const { currentIndex, actions } = get();
    if (currentIndex >= actions.length - 1) return;
    set({ currentIndex: currentIndex + 1 });
  },

  canUndo: () => {
    const { currentIndex } = get();
    return currentIndex >= 0;
  },

  canRedo: () => {
    const { currentIndex, actions } = get();
    return currentIndex < actions.length - 1;
  },

  toggleRecording: () => set((s) => ({ isRecording: !s.isRecording })),
  clear: () => set({ actions: [], currentIndex: -1 })
}));
