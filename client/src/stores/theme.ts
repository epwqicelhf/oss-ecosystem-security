import { create } from 'zustand';

interface ThemeState {
  current: string;
  themes: { id: string; name: string; color: string }[];
  setTheme: (theme: string) => void;
}

const themeMap: Record<string, Record<string, string>> = {
  'tech-blue': {
    '--primary': '#3b82f6',
    '--primary-light': '#60a5fa',
    '--primary-glow': 'rgba(59, 130, 246, 0.15)',
    '--bg-primary': 'rgba(10, 22, 44, 0.95)',
    '--bg-secondary': 'rgba(6, 13, 26, 0.95)',
    '--bg-card': 'rgba(17, 33, 60, 0.65)',
    '--text-primary': '#f0f6ff',
    '--text-secondary': '#b0c8e8',
    '--text-muted': '#7a9bc5',
    '--border': 'rgba(59, 130, 246, 0.2)',
    '--border-light': 'rgba(59, 130, 246, 0.35)',
  },
  'dark-green': {
    '--primary': '#22c55e',
    '--primary-light': '#4ade80',
    '--primary-glow': 'rgba(34, 197, 94, 0.15)',
    '--bg-primary': 'rgba(8, 28, 16, 0.95)',
    '--bg-secondary': 'rgba(4, 18, 8, 0.95)',
    '--bg-card': 'rgba(12, 40, 22, 0.65)',
    '--text-primary': '#f0fff0',
    '--text-secondary': '#a8e6a8',
    '--text-muted': '#6bb86b',
    '--border': 'rgba(34, 197, 94, 0.2)',
    '--border-light': 'rgba(34, 197, 94, 0.35)',
  },
  'dark-purple': {
    '--primary': '#8b5cf6',
    '--primary-light': '#a78bfa',
    '--primary-glow': 'rgba(139, 92, 246, 0.15)',
    '--bg-primary': 'rgba(16, 8, 36, 0.95)',
    '--bg-secondary': 'rgba(10, 4, 24, 0.95)',
    '--bg-card': 'rgba(24, 14, 52, 0.65)',
    '--text-primary': '#f8f0ff',
    '--text-secondary': '#c8a8e8',
    '--text-muted': '#9070c0',
    '--border': 'rgba(139, 92, 246, 0.2)',
    '--border-light': 'rgba(139, 92, 246, 0.35)',
  },
  'light': {
    '--primary': '#3b82f6',
    '--primary-light': '#2563eb',
    '--primary-glow': 'rgba(59, 130, 246, 0.1)',
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f5f5f5',
    '--bg-card': 'rgba(255, 255, 255, 0.9)',
    '--text-primary': '#262626',
    '--text-secondary': '#595959',
    '--text-muted': '#8c8c8c',
    '--border': 'rgba(0, 0, 0, 0.1)',
    '--border-light': 'rgba(0, 0, 0, 0.15)',
  },
};

export const useThemeStore = create<ThemeState>((set) => ({
  current: 'tech-blue',
  themes: [
    { id: 'tech-blue', name: 'Tech Blue', color: '#3b82f6' },
    { id: 'dark-green', name: 'Dark Green', color: '#22c55e' },
    { id: 'dark-purple', name: 'Dark Purple', color: '#8b5cf6' },
    { id: 'light', name: 'Light', color: '#f5f5f5' },
  ],
  setTheme: (theme) => {
    const vars = themeMap[theme] || themeMap['tech-blue'];
    const root = document.documentElement;
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
    set({ current: theme });
  },
}));
