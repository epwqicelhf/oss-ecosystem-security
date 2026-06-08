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
        colorPrimary: '#1890ff',
        colorBgContainer: '#0a1628',
        colorBgLayout: '#060d1a',
        colorBgElevated: '#111d33',
        colorText: '#e6f0ff',
        colorTextSecondary: '#8ba3c7',
        colorBorder: '#1a3a5c',
        borderRadius: 8,
        fontFamily: "'Inter', 'Noto Sans SC', -apple-system, sans-serif"
      }
    },
    'dark-green': {
      token: {
        colorPrimary: '#52c41a',
        colorBgContainer: '#0a1a0d',
        colorBgLayout: '#061208',
        colorBgElevated: '#112a15',
        colorText: '#e6ffe6',
        colorTextSecondary: '#8bc78b',
        colorBorder: '#1a5c2a',
        borderRadius: 8
      }
    },
    'dark-purple': {
      token: {
        colorPrimary: '#722ed1',
        colorBgContainer: '#140a28',
        colorBgLayout: '#0d061a',
        colorBgElevated: '#1d1133',
        colorText: '#f0e6ff',
        colorTextSecondary: '#a38bc7',
        colorBorder: '#3a1a5c',
        borderRadius: 8
      }
    },
    'light': {
      token: {
        colorPrimary: '#1890ff',
        colorBgContainer: '#ffffff',
        colorBgLayout: '#f5f5f5',
        colorBgElevated: '#ffffff',
        colorText: '#262626',
        colorTextSecondary: '#595959',
        colorBorder: '#d9d9d9',
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
