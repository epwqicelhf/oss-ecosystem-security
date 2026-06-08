import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, Typography, Divider, message, Space, Table, Tag } from 'antd';
import { SettingOutlined, SaveOutlined } from '@ant-design/icons';
import { configApi } from '../api';
import type { AppConfig, CategoryInfo } from '../api';
import { useHistoryStore } from '../stores/history';
import { useThemeStore } from '../stores/theme';
import { useLanguageStore } from '../stores/language';

const { Title } = Typography;

const Settings: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();
  const { addAction } = useHistoryStore();
  const { setTheme } = useThemeStore();
  const { t, current: lang } = useLanguageStore();
  const isZh = lang === 'zh-CN';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configData, catData] = await Promise.all([
        configApi.get(),
        configApi.getCategories()
      ]);
      setConfig(configData);
      setCategories(catData);
      form.setFieldsValue(configData);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const saveConfig = async (values: AppConfig) => {
    try {
      const prev = config;
      await configApi.update(values);
      if (values.theme !== prev?.theme) {
        setTheme(values.theme);
      }
      addAction({
        type: 'update-config',
        description: 'Updated application settings',
        undo: async () => {
          if (prev) await configApi.update(prev);
          loadData();
        }
      });
      setConfig(values);
      message.success(t.settings.saved);
    } catch {
      message.error(t.settings.saveFailed);
    }
  };

  const severityColor = (s: string) => {
    return { critical: '#cf1322', high: '#ff4d4f', medium: '#faad14', low: '#1890ff' }[s] || '#8c8c8c';
  };

  const categoryColumns = [
    { title: t.settings.check, key: 'name',
      render: (_: unknown, record: any) => isZh ? record.name_zh || record.name : record.name
    },
    { title: t.settings.id, dataIndex: 'id', key: 'id', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Severity', key: 'severity',
      render: (_: unknown, record: any) => (
        <Tag color={severityColor(record.severity)} style={{ fontWeight: 700 }}>{record.severity?.toUpperCase()}</Tag>
      )
    },
    { title: t.settings.description, key: 'description',
      render: (_: unknown, record: any) => isZh ? record.description_zh || record.description : record.description
    },
    { title: t.settings.weight, dataIndex: 'weight', key: 'weight',
      render: (v: number) => <Tag color={v >= 10 ? 'red' : v >= 7.5 ? 'orange' : v >= 5 ? 'blue' : 'default'}>{v}</Tag>
    },
    {
      title: t.settings.enabled, key: 'enabled',
      render: (_: unknown, record: any) => {
        const enabled = config?.enabledCategories.includes(record.id) ?? false;
        return <Tag color={enabled ? 'green' : 'default'}>{enabled ? t.settings.yes : t.settings.no}</Tag>;
      }
    }
  ];

  return (
    <div>
      <Title level={3} style={{ margin: 0, marginBottom: 24, color: '#e6f0ff' }}>
        <SettingOutlined /> {t.settings.title}
      </Title>

      <Card className="card" title={t.settings.generalConfig} loading={loading}>
        <Form form={form} onFinish={saveConfig} layout="vertical">
          <Form.Item name="workspacePath" label={t.settings.workspacePath}>
            <Input placeholder="./repos" />
          </Form.Item>
          <Form.Item name="cloneDepth" label={t.settings.cloneDepth}>
            <Input type="number" min={1} />
          </Form.Item>
          <Form.Item name="commitDepth" label={t.settings.commitDepth}>
            <Input type="number" min={1} max={100} />
          </Form.Item>
          <Form.Item name="theme" label={t.settings.theme}>
            <Select>
              <Select.Option value="tech-blue">{t.settings.themeTechBlue}</Select.Option>
              <Select.Option value="dark-green">{t.settings.themeDarkGreen}</Select.Option>
              <Select.Option value="dark-purple">{t.settings.themeDarkPurple}</Select.Option>
              <Select.Option value="light">{t.settings.themeLight}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="enabledCategories" label={t.settings.enabledCategories}>
            <Select mode="multiple" placeholder="Select categories">
              {categories.map(c => (
                <Select.Option key={c.id} value={c.id}>{t.categories[c.id as keyof typeof t.categories] || c.name} (w:{c.weight})</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>{t.common.save}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Divider />

      <Card className="card" title={t.settings.checkCategories} style={{ marginTop: 16 }}>
        <Table
          dataSource={categories}
          columns={categoryColumns}
          rowKey="id"
          pagination={false}
          size="small"
        />
        <div style={{ marginTop: 16, fontSize: 13, color: '#8ba3c7' }}>
          {t.settings.categoriesDesc}
        </div>
      </Card>
    </div>
  );
};

export default Settings;
