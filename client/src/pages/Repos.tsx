import React, { useEffect, useState } from 'react';
import { Card, Button, Form, Input, Select, Table, Space, Tag, message, Modal, Typography, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, SyncOutlined, PlayCircleOutlined, GithubOutlined } from '@ant-design/icons';
import { reposApi, checksApi } from '../api';
import type { RepoConfig } from '../api';
import { useHistoryStore } from '../stores/history';
import { useLanguageStore } from '../stores/language';

const { Title } = Typography;
const { Option } = Select;

const Repos: React.FC = () => {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [form] = Form.useForm();
  const { addAction } = useHistoryStore();
  const { t } = useLanguageStore();

  useEffect(() => { loadRepos(); }, []);

  const loadRepos = async () => {
    setLoading(true);
    try {
      const data = await reposApi.list();
      setRepos(data);
    } catch (err) {
      message.error(t.repos.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const addRepo = async (values: { url: string; name: string; branch: string }) => {
    setAddLoading(true);
    try {
      await reposApi.add(values.url, values.name, values.branch);
      addAction({
        type: 'add-repo',
        description: `Added repository: ${values.name}`,
        undo: async () => {
          const updated = await reposApi.list();
          const repo = updated.find(r => r.name === values.name);
          if (repo) await reposApi.remove(repo.id);
          loadRepos();
        }
      });
      message.success(t.repos.addedSuccess.replace('{name}', values.name));
      setAddModalOpen(false);
      form.resetFields();
      loadRepos();
    } catch (err: any) {
      message.error(err?.response?.data?.error || t.repos.addFailed);
    } finally {
      setAddLoading(false);
    }
  };

  const removeRepo = async (id: string, name: string) => {
    try {
      await reposApi.remove(id);
      addAction({
        type: 'remove-repo',
        description: `Removed repository: ${name}`
      });
      message.success(t.repos.removedSuccess.replace('{name}', name));
      loadRepos();
    } catch (err) {
      message.error(t.repos.removeFailed);
    }
  };

  const pullRepo = async (id: string, name: string) => {
    try {
      await reposApi.pull(id);
      addAction({
        type: 'pull-repo',
        description: `Pulled updates for: ${name}`
      });
      message.success(t.repos.updatedSuccess.replace('{name}', name));
    } catch (err: any) {
      message.error(err?.response?.data?.error || t.repos.pullFailed);
    }
  };

  const runCheck = async (id: string, name: string) => {
    try {
      await checksApi.run(id);
      addAction({
        type: 'run-check',
        description: `Ran security check on: ${name}`
      });
      message.success(t.repos.checkCompleted.replace('{name}', name));
    } catch (err: any) {
      message.error(err?.response?.data?.error || t.repos.checkFailed);
    }
  };

  const columns = [
    { title: t.repos.name, dataIndex: 'name', key: 'name',
      render: (name: string) => <Space><GithubOutlined /> {name}</Space>
    },
    { title: t.repos.url, dataIndex: 'url', key: 'url', ellipsis: true },
    { title: t.repos.branch, dataIndex: 'branch', key: 'branch',
      render: (v: string) => <Tag color="blue">{v}</Tag>
    },
    { title: t.repos.added, dataIndex: 'addedAt', key: 'addedAt',
      render: (v: string) => new Date(v).toLocaleString()
    },
    { title: t.repos.lastCheck, dataIndex: 'lastChecked', key: 'lastChecked',
      render: (v: string) => v ? new Date(v).toLocaleString() : <Tag>{t.repos.never}</Tag>
    },
    { title: t.repos.actions, key: 'actions',
      render: (_: unknown, record: RepoConfig) => (
        <Space>
          <Button size="small" icon={<SyncOutlined />} onClick={() => pullRepo(record.id, record.name)}>{t.repos.pull}</Button>
          <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => runCheck(record.id, record.name)}>{t.repos.check}</Button>
          <Popconfirm title={t.repos.removeConfirm} onConfirm={() => removeRepo(record.id, record.name)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, color: '#e6f0ff' }}>
          <GithubOutlined /> {t.repos.title}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
          {t.repos.addRepo}
        </Button>
      </div>

      <Card className="card">
        <Table
          dataSource={repos}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={t.repos.addRepoTitle}
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        footer={null}
      >
        <Form form={form} onFinish={addRepo} layout="vertical">
          <Form.Item name="url" label={t.repos.repoUrl} rules={[{ required: true, message: t.repos.repoUrl }]}>
            <Input placeholder="https://github.com/owner/repo.git" prefix={<GithubOutlined />} />
          </Form.Item>
          <Form.Item name="name" label={t.repos.displayName}>
            <Input placeholder={t.repos.displayNamePlaceholder} />
          </Form.Item>
          <Form.Item name="branch" label={t.repos.branch} initialValue="main">
            <Select>
              <Option value="main">main</Option>
              <Option value="master">master</Option>
              <Option value="develop">develop</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={addLoading}>{t.repos.cloneAndAdd}</Button>
              <Button onClick={() => setAddModalOpen(false)}>{t.common.cancel}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Repos;
