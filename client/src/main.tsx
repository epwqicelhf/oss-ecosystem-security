import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import App from './App';
import { useThemeStore } from './stores/theme';
import './index.css';

const ThemedApp: React.FC = () => {
  const theme = useThemeStore((s) => s.current);
  const antTheme = getAntTheme(theme);

  return (
    <ConfigProvider theme={antTheme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  );
};

function getAntTheme(themeName: string) {
  const themes: Record<string, { token: Record<string, unknown> }> = {
    'tech-blue': {
      token: {
        colorPrimary: '#3b82f6',
        colorBgContainer: 'rgba(17, 33, 60, 0.65)',
        colorBgLayout: 'rgba(6, 13, 26, 0.95)',
        colorBgElevated: 'rgba(10, 22, 44, 0.95)',
        colorText: '#f0f6ff',
        colorTextSecondary: '#b0c8e8',
        colorBorder: 'rgba(59, 130, 246, 0.2)',
        borderRadius: 8,
        fontFamily: "'Inter', 'Noto Sans SC', -apple-system, sans-serif"
      }
    },
    'dark-green': {
      token: {
        colorPrimary: '#22c55e',
        colorBgContainer: 'rgba(12, 40, 22, 0.65)',
        colorBgLayout: 'rgba(4, 18, 8, 0.95)',
        colorBgElevated: 'rgba(8, 28, 16, 0.95)',
        colorText: '#f0fff0',
        colorTextSecondary: '#a8e6a8',
        colorBorder: 'rgba(34, 197, 94, 0.2)',
        borderRadius: 8
      }
    },
    'dark-purple': {
      token: {
        colorPrimary: '#8b5cf6',
        colorBgContainer: 'rgba(24, 14, 52, 0.65)',
        colorBgLayout: 'rgba(10, 4, 24, 0.95)',
        colorBgElevated: 'rgba(16, 8, 36, 0.95)',
        colorText: '#f8f0ff',
        colorTextSecondary: '#c8a8e8',
        colorBorder: 'rgba(139, 92, 246, 0.2)',
        borderRadius: 8
      }
    },
    'light': {
      token: {
        colorPrimary: '#3b82f6',
        colorBgContainer: 'rgba(255, 255, 255, 0.9)',
        colorBgLayout: '#f5f5f5',
        colorBgElevated: '#ffffff',
        colorText: '#262626',
        colorTextSecondary: '#595959',
        colorBorder: 'rgba(0, 0, 0, 0.1)',
        borderRadius: 8
      }
    }
  };
  return themes[themeName] || themes['tech-blue'];
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>
);
