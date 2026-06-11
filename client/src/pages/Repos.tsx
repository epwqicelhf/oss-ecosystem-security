import React, { useEffect, useState, useMemo } from 'react';
import { Card, Button, Form, Input, Select, Space, Tag, message, Modal, Typography, Popconfirm, Collapse, Badge, Progress, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, SyncOutlined, PlayCircleOutlined, GithubOutlined, BranchesOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { reposApi, checksApi } from '../api';
import type { RepoConfig, CheckResult } from '../api';
import { useHistoryStore } from '../stores/history';
import { useLanguageStore } from '../stores/language';

const { Title, Text } = Typography;

function parseUrl(url: string): { platform: string; owner: string; name: string } | null {
  try {
    const cleaned = url.replace(/\.git$/, '').replace(/\/+$/, '');
    const u = new URL(cleaned);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const name = parts[parts.length - 1];
    const owner = parts[parts.length - 2];
    const host = u.hostname.toLowerCase();
    let platform = 'atomgit';
    if (host.includes('github.com')) platform = 'github';
    else if (host.includes('gitlab.com') || host.includes('gitlab')) platform = 'gitlab';
    else if (host.includes('gitcode.com')) platform = 'gitcode';
    else if (host.includes('atomgit.com')) platform = 'atomgit';
    return { platform, owner, name };
  } catch {
    return null;
  }
}

const platformColor: Record<string, string> = { atomgit: 'blue', github: 'green', gitlab: 'orange', gitcode: 'purple' };

const Repos: React.FC = () => {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [form] = Form.useForm();
  const { addAction } = useHistoryStore();
  const { t, current: lang } = useLanguageStore();
  const isZh = lang === 'zh-CN';

  const parsed = useMemo(() => parseUrl(urlInput), [urlInput]);

  useEffect(() => { loadRepos(); }, []);

  const loadRepos = async () => {
    setLoading(true);
    try {
      const [reposData, resultsData] = await Promise.all([reposApi.list(), checksApi.getAllResults()]);
      setRepos(reposData);
      setResults(resultsData);
    } catch {
      message.error(t.repos.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, { platform: string; owner: string; repos: RepoConfig[] }> = {};
    for (const r of repos) {
      const key = `${r.platform}/${r.owner}`;
      if (!map[key]) map[key] = { platform: r.platform, owner: r.owner, repos: [] };
      map[key].repos.push(r);
    }
    return Object.values(map).sort((a, b) => b.repos.length - a.repos.length);
  }, [repos]);

  const addRepo = async (values: { url: string; branch: string; apiToken: string }) => {
    const p = parseUrl(values.url);
    if (!p) { message.error(isZh ? '无法解析仓库地址' : 'Cannot parse repository URL'); return; }
    setAddLoading(true);
    try {
      await reposApi.add(values.url, p.name, values.branch, p.platform, values.apiToken);
      addAction({
        type: 'add-repo',
        description: `Added repository: ${p.owner}/${p.name}`,
        undo: async () => {
          const updated = await reposApi.list();
          const repo = updated.find(r => r.name === p.name && r.owner === p.owner);
          if (repo) await reposApi.remove(repo.id);
          loadRepos();
        }
      });
      message.success(t.repos.addedSuccess.replace('{name}', `${p.owner}/${p.name}`));
      setAddModalOpen(false);
      form.resetFields();
      setUrlInput('');
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
      addAction({ type: 'remove-repo', description: `Removed repository: ${name}` });
      message.success(t.repos.removedSuccess.replace('{name}', name));
      loadRepos();
    } catch {
      message.error(t.repos.removeFailed);
    }
  };

  const pullRepo = async (id: string, name: string) => {
    try {
      await reposApi.pull(id);
      addAction({ type: 'pull-repo', description: `Pulled updates for: ${name}` });
      message.success(t.repos.updatedSuccess.replace('{name}', name));
    } catch (err: any) {
      message.error(err?.response?.data?.error || t.repos.pullFailed);
    }
  };

  const runCheck = async (id: string, name: string) => {
    try {
      await checksApi.run(id);
      addAction({ type: 'run-check', description: `Ran security check on: ${name}` });
      message.success(t.repos.checkCompleted.replace('{name}', name));
      loadRepos();
    } catch (err: any) {
      message.error(err?.response?.data?.error || t.repos.checkFailed);
    }
  };

  const runAllChecks = async () => {
    setLoading(true);
    try {
      await checksApi.runAll();
      message.success(isZh ? '所有仓库检查完成' : 'All checks completed');
      loadRepos();
    } catch (err: any) {
      message.error(err?.response?.data?.error || t.repos.checkFailed);
    } finally {
      setLoading(false);
    }
  };

  const pullAll = async () => {
    setLoading(true);
    try {
      await reposApi.pullAll();
      message.success(isZh ? '所有仓库更新完成' : 'All repos updated');
      loadRepos();
    } catch (err: any) {
      message.error(err?.response?.data?.error || t.repos.pullFailed);
    } finally {
      setLoading(false);
    }
  };

  const renderRepoCard = (repo: RepoConfig) => {
    const result = results[repo.id]?.[0];
    const score = result?.normalizedScore ?? -1;
    const scoreColor = score >= 8 ? '#52c41a' : score >= 5 ? '#faad14' : score >= 0 ? '#ff4d4f' : '#8c8c8c';

    return (
      <div key={repo.id} style={{
        padding: '14px 18px', borderBottom: '1px solid rgba(59,130,246,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        transition: 'background 0.2s',
      }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59,130,246,0.04)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <GithubOutlined style={{ color: '#3b82f6' }} />
            <Text strong style={{ fontSize: 14, color: '#f0f6ff' }}>{repo.name}</Text>
            <Tag color="blue">{repo.branch}</Tag>
            {result?.summary && (
              <Space size={4}>
                {result.summary.pass > 0 && <Tag color="success" style={{ fontSize: 11 }}><CheckCircleOutlined /> {result.summary.pass}</Tag>}
                {result.summary.fail > 0 && <Tag color="error" style={{ fontSize: 11 }}><CloseCircleOutlined /> {result.summary.fail}</Tag>}
                {result.summary.warning > 0 && <Tag color="warning" style={{ fontSize: 11 }}><WarningOutlined /> {result.summary.warning}</Tag>}
              </Space>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#b0c8e8' }}>
            <span>{t.repos.added}: {new Date(repo.addedAt).toLocaleString()}</span>
            {repo.lastChecked && <span style={{ marginLeft: 16 }}>{t.repos.lastCheck}: {new Date(repo.lastChecked).toLocaleString()}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {score >= 0 ? (
            <div style={{ textAlign: 'center', width: 60 }}>
              <Progress type="circle" percent={Math.round(score * 10)} size={44}
                strokeColor={scoreColor} format={() => <span style={{ fontSize: 12, fontWeight: 700 }}>{score}</span>} />
            </div>
          ) : (
            <Tag>{t.repos.never}</Tag>
          )}
          <Space>
            <Button size="small" icon={<SyncOutlined />} onClick={() => pullRepo(repo.id, repo.name)}>{t.repos.pull}</Button>
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => runCheck(repo.id, repo.name)}>{t.repos.check}</Button>
            <Popconfirm title={t.repos.removeConfirm} onConfirm={() => removeRepo(repo.id, repo.name)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, color: '#f0f6ff' }}>
          <BranchesOutlined /> {t.repos.title}
        </Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={pullAll} disabled={repos.length === 0}>{isZh ? '全部拉取' : 'Pull All'}</Button>
          <Button icon={<PlayCircleOutlined />} onClick={runAllChecks} disabled={repos.length === 0}>{isZh ? '全部检查' : 'Check All'}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            {t.repos.addRepo}
          </Button>
        </Space>
      </div>

      {grouped.length === 0 && !loading && (
        <Card className="card"><Empty description={isZh ? '暂无仓库，请添加开源仓库地址' : 'No repositories yet. Please add a repository URL.'} /></Card>
      )}

      <Collapse
        defaultActiveKey={grouped.map((_, i) => String(i))}
        items={grouped.map((group, i) => ({
          key: String(i),
          label: (
            <Space>
              <Tag color={platformColor[group.platform] || 'default'} style={{ fontWeight: 700, textTransform: 'uppercase' }}>{group.platform}</Tag>
              <Text strong style={{ fontSize: 15, color: '#f0f6ff' }}>{group.owner}</Text>
              <Badge count={group.repos.length} style={{ backgroundColor: '#3b82f6' }} />
            </Space>
          ),
          children: (
            <div>
              {group.repos.map(renderRepoCard)}
            </div>
          ),
        }))}
        style={{ background: 'transparent' }}
      />

      <Modal
        title={t.repos.addRepoTitle}
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); form.resetFields(); setUrlInput(''); }}
        footer={null}
        width={560}
      >
        <Form form={form} onFinish={addRepo} layout="vertical" initialValues={{ branch: 'master' }}>
          <Form.Item name="url" label={t.repos.repoUrl} rules={[
            { required: true, message: t.repos.repoUrl },
            { validator: (_, v) => parseUrl(v) ? Promise.resolve() : Promise.reject(isZh ? '无法解析地址，格式: https://atomgit.com/owner/repo.git' : 'Cannot parse URL. Format: https://atomgit.com/owner/repo.git') }
          ]}>
            <Input
              placeholder="https://atomgit.com/openeuler/stratovirt.git"
              prefix={<GithubOutlined />}
              onChange={(e) => setUrlInput(e.target.value)}
            />
          </Form.Item>

          {parsed && (
            <div style={{
              padding: '12px 16px', marginBottom: 16, borderRadius: 8,
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
              display: 'flex', gap: 24, flexWrap: 'wrap',
            }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>{isZh ? '平台' : 'Platform'}</Text>
                <div><Tag color={platformColor[parsed.platform]} style={{ fontWeight: 700, marginTop: 4 }}>{parsed.platform}</Tag></div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>{isZh ? '所属组织 (Owner)' : 'Organization (Owner)'}</Text>
                <div><Text strong style={{ color: '#f0f6ff' }}>{parsed.owner}</Text></div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>{isZh ? '项目名称' : 'Project Name'}</Text>
                <div><Text strong style={{ color: '#f0f6ff' }}>{parsed.name}</Text></div>
              </div>
            </div>
          )}

          <Form.Item name="branch" label={t.repos.branch}>
            <Select>
              <Select.Option value="master">master</Select.Option>
              <Select.Option value="main">main</Select.Option>
              <Select.Option value="develop">develop</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="apiToken" label={isZh ? 'API Token（可选）' : 'API Token (Optional)'}>
            <Input.Password placeholder={isZh ? '用于访问平台 API 获取 PR 审查等信息' : 'For accessing platform API to get PR review info'} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={addLoading} disabled={!parsed}>{t.repos.cloneAndAdd}</Button>
              <Button onClick={() => { setAddModalOpen(false); form.resetFields(); setUrlInput(''); }}>{t.common.cancel}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Repos;
