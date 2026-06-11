import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CheckResult } from '../api';

interface CheckStoreState {
  selectedRepoId: string;
  results: CheckResult[];
  currentResult: CheckResult | null;
  expandedKeys: string[];
  sidebarGroupKeys: string[];
  setSelectedRepoId: (id: string) => void;
  setResults: (results: CheckResult[]) => void;
  setCurrentResult: (result: CheckResult | null) => void;
  setExpandedKeys: (keys: string[]) => void;
  setSidebarGroupKeys: (keys: string[]) => void;
}

export const useCheckStore = create<CheckStoreState>()(
  persist(
    (set) => ({
      selectedRepoId: '',
      results: [],
      currentResult: null,
      expandedKeys: [],
      sidebarGroupKeys: [],
      setSelectedRepoId: (id) => set({ selectedRepoId: id }),
      setResults: (results) => set({ results }),
      setCurrentResult: (result) => set({ currentResult: result }),
      setExpandedKeys: (keys) => set({ expandedKeys: keys }),
      setSidebarGroupKeys: (keys) => set({ sidebarGroupKeys: keys }),
    }),
    {
      name: 'check-store',
      partialize: (state) => ({
        selectedRepoId: state.selectedRepoId,
        expandedKeys: state.expandedKeys,
        sidebarGroupKeys: state.sidebarGroupKeys,
      }),
    },
  ),
);
