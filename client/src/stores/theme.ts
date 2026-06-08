import { create } from 'zustand';

interface ThemeState {
  current: string;
  themes: { id: string; name: string; color: string }[];
  setTheme: (theme: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  current: 'tech-blue',
  themes: [
    { id: 'tech-blue', name: 'Tech Blue', color: '#1890ff' },
    { id: 'dark-green', name: 'Dark Green', color: '#52c41a' },
    { id: 'dark-purple', name: 'Dark Purple', color: '#722ed1' },
    { id: 'light', name: 'Light', color: '#f5f5f5' }
  ],
  setTheme: (theme) => {
    document.documentElement.style.setProperty('--primary', getPrimaryColor(theme));
    document.documentElement.style.setProperty('--bg-primary', getBgPrimary(theme));
    document.documentElement.style.setProperty('--bg-secondary', getBgSecondary(theme));
    document.documentElement.style.setProperty('--bg-card', getBgCard(theme));
    document.documentElement.style.setProperty('--text-primary', getTextPrimary(theme));
    document.documentElement.style.setProperty('--text-secondary', getTextSecondary(theme));
    document.documentElement.style.setProperty('--border', getBorder(theme));
    set({ current: theme });
  }
}));

function getPrimaryColor(t: string): string {
  return { 'tech-blue': '#1890ff', 'dark-green': '#52c41a', 'dark-purple': '#722ed1', 'light': '#1890ff' }[t] || '#1890ff';
}
function getBgPrimary(t: string): string {
  return { 'tech-blue': '#0a1628', 'dark-green': '#0a1a0d', 'dark-purple': '#140a28', 'light': '#ffffff' }[t] || '#0a1628';
}
function getBgSecondary(t: string): string {
  return { 'tech-blue': '#060d1a', 'dark-green': '#061208', 'dark-purple': '#0d061a', 'light': '#f5f5f5' }[t] || '#060d1a';
}
function getBgCard(t: string): string {
  return { 'tech-blue': '#111d33', 'dark-green': '#112a15', 'dark-purple': '#1d1133', 'light': '#ffffff' }[t] || '#111d33';
}
function getTextPrimary(t: string): string {
  return { 'tech-blue': '#e6f0ff', 'dark-green': '#e6ffe6', 'dark-purple': '#f0e6ff', 'light': '#262626' }[t] || '#e6f0ff';
}
function getTextSecondary(t: string): string {
  return { 'tech-blue': '#8ba3c7', 'dark-green': '#8bc78b', 'dark-purple': '#a38bc7', 'light': '#595959' }[t] || '#8ba3c7';
}
function getBorder(t: string): string {
  return { 'tech-blue': '#1a3a5c', 'dark-green': '#1a5c2a', 'dark-purple': '#3a1a5c', 'light': '#d9d9d9' }[t] || '#1a3a5c';
}
