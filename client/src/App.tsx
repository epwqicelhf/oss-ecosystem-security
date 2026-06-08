import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Space, Tooltip, Select } from 'antd';
import {
  DashboardOutlined,
  BranchesOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UndoOutlined,
  RedoOutlined,
  VideoCameraOutlined,
  HistoryOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import { useThemeStore } from './stores/theme';
import { useHistoryStore } from './stores/history';
import { useLanguageStore } from './stores/language';
import Dashboard from './pages/Dashboard';
import Repos from './pages/Repos';
import CheckResults from './pages/CheckResults';
import Settings from './pages/Settings';

const { Header, Sider, Content } = Layout;

const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { themes, current, setTheme } = useThemeStore();
  const { undo, redo, canUndo, canRedo, isRecording, toggleRecording, actions, currentIndex } = useHistoryStore();
  const { t, current: lang, setLanguage } = useLanguageStore();

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: t.menu.dashboard },
    { key: '/repos', icon: <BranchesOutlined />, label: t.menu.repos },
    { key: '/checks', icon: <SafetyCertificateOutlined />, label: t.menu.checks },
    { key: '/settings', icon: <SettingOutlined />, label: t.menu.settings }
  ];

  const languageOptions = [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="layout-header">
        <div className="logo">
          <div className="logo-icon">
            <SafetyCertificateOutlined />
          </div>
          {t.header.title}
        </div>

        <Space size="middle">
          <div className="undo-redo-bar" style={{ marginBottom: 0, padding: '4px 12px' }}>
            <Tooltip title={t.header.undo}>
              <Button
                type="text"
                icon={<UndoOutlined />}
                disabled={!canUndo()}
                onClick={undo}
                size="small"
              />
            </Tooltip>
            <Tooltip title={t.header.redo}>
              <Button
                type="text"
                icon={<RedoOutlined />}
                disabled={!canRedo()}
                onClick={redo}
                size="small"
              />
            </Tooltip>
            <Tooltip title={isRecording ? t.header.stopRecording : t.header.startRecording}>
              <Button
                type="text"
                icon={isRecording ? <VideoCameraOutlined style={{ color: '#ff4d4f' }} /> : <VideoCameraOutlined />}
                onClick={toggleRecording}
                size="small"
              />
            </Tooltip>
            {isRecording && (
              <div className="recording-indicator">
                <div className="recording-dot" />
                REC ({actions.length})
              </div>
            )}
            <Tooltip title={t.header.actionHistory}>
              <Button type="text" icon={<HistoryOutlined />} size="small">
                {currentIndex >= 0 ? `${currentIndex + 1}/${actions.length}` : '0/0'}
              </Button>
            </Tooltip>
          </div>

          <div className="theme-selector">
            {themes.map((th) => (
              <Tooltip key={th.id} title={t.themes[th.id as keyof typeof t.themes] || th.name}>
                <div
                  className={`theme-dot ${th.id} ${current === th.id ? 'active' : ''}`}
                  onClick={() => setTheme(th.id)}
                />
              </Tooltip>
            ))}
          </div>

          <Select
            value={lang}
            onChange={setLanguage}
            options={languageOptions}
            style={{ width: 100 }}
            size="small"
            suffixIcon={<GlobalOutlined />}
          />
        </Space>
      </Header>

      <Layout>
        <Sider
          className="layout-sider"
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={220}
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ background: 'transparent', border: 'none', paddingTop: 16 }}
          />
        </Sider>

        <Content className="layout-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/repos" element={<Repos />} />
            <Route path="/checks" element={<CheckResults />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
