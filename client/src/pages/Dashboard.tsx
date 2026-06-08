import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Progress, Table, Tag, Typography, Spin, Button, Space } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  BranchesOutlined,
  BugOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { reposApi, checksApi } from '../api';
import type { RepoConfig, CheckResult } from '../api';
import { useHistoryStore } from '../stores/history';
import { useLanguageStore } from '../stores/language';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult[]>>({});
  const [loading, setLoading] = useState(true);
  const { addAction } = useHistoryStore();
  const { t } = useLanguageStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reposData, resultsData] = await Promise.all([
        reposApi.list(),
        checksApi.getAllResults()
      ]);
      setRepos(reposData);
      setResults(resultsData);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const runAllChecks = async () => {
    setLoading(true);
    try {
      const res = await checksApi.runAll();
      addAction({
        type: 'run-all-checks',
        description: 'Ran security checks on all repositories'
      });
      const [, resultsData] = await Promise.all([
        reposApi.list(),
        checksApi.getAllResults()
      ]);
      setResults(resultsData);
      if (res.errors.length > 0) {
        console.warn('Some checks failed:', res.errors);
      }
    } catch (err) {
      console.error('Failed to run checks:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const allResults = Object.values(results).map(r => r[0]).filter(Boolean);
  const avgScore = allResults.length > 0
    ? Math.round(allResults.reduce((s, r) => s + r.normalizedScore, 0) / allResults.length * 10) / 10
    : 0;
  const totalHigh = allResults.reduce((s, r) => s + r.summary.highRisk, 0);
  const totalCritical = allResults.reduce((s, r) => s + r.summary.criticalRisk, 0);
  const totalMedium = allResults.reduce((s, r) => s + r.summary.mediumRisk, 0);
  const totalPass = allResults.reduce((s, r) => s + r.summary.pass, 0);
  const totalFail = allResults.reduce((s, r) => s + r.summary.fail, 0);

  const radarData = allResults.length > 0 ? allResults[0].probes.map(p => ({
    name: p.name,
    max: p.maxScore,
    score: p.score
  })) : [];

  const radarOption = {
    backgroundColor: 'transparent',
    radar: {
      indicator: radarData.map(d => ({ name: d.name, max: d.max })),
      shape: 'polygon',
      splitNumber: 5,
      axisName: { color: '#8ba3c7', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1a3a5c' } },
      splitArea: { areaStyle: { color: ['rgba(24,144,255,0.02)', 'rgba(24,144,255,0.05)'] } },
      axisLine: { lineStyle: { color: '#1a3a5c' } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: radarData.map(d => d.score),
        name: 'Score',
        areaStyle: { color: 'rgba(24,144,255,0.3)' },
        lineStyle: { color: '#1890ff' },
        itemStyle: { color: '#1890ff' }
      }]
    }]
  };

  const scoreDistribution = [
    { range: '0-2', count: allResults.filter(r => r.normalizedScore <= 2).length, color: '#ff4d4f' },
    { range: '3-4', count: allResults.filter(r => r.normalizedScore > 2 && r.normalizedScore <= 4).length, color: '#faad14' },
    { range: '5-6', count: allResults.filter(r => r.normalizedScore > 4 && r.normalizedScore <= 6).length, color: '#1890ff' },
    { range: '7-8', count: allResults.filter(r => r.normalizedScore > 6 && r.normalizedScore <= 8).length, color: '#36cfc9' },
    { range: '9-10', count: allResults.filter(r => r.normalizedScore > 8).length, color: '#52c41a' }
  ];

  const barOption = {
    backgroundColor: 'transparent',
    xAxis: {
      type: 'category',
      data: scoreDistribution.map(d => d.range),
      axisLine: { lineStyle: { color: '#1a3a5c' } },
      axisLabel: { color: '#8ba3c7' }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#1a3a5c' } },
      axisLabel: { color: '#8ba3c7' },
      splitLine: { lineStyle: { color: '#1a3a5c30' } }
    },
    series: [{
      type: 'bar',
      data: scoreDistribution.map(d => ({ value: d.count, itemStyle: { color: d.color } })),
      barWidth: 40,
      borderRadius: [4, 4, 0, 0]
    }],
    grid: { top: 10, bottom: 30, left: 40, right: 10 }
  };

  const repoColumns = [
    { title: t.repos.name, dataIndex: 'name', key: 'name',
      render: (name: string, record: RepoConfig) => (
        <a onClick={() => navigate(`/checks?repo=${record.id}`)}>{name}</a>
      )
    },
    { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true,
      render: (url: string) => <Text copyable={{ text: url }}>{url}</Text>
    },
    { title: t.checks.score, key: 'score',
      render: (_: unknown, record: RepoConfig) => {
        const result = results[record.id]?.[0];
        if (!result) return <Tag>{t.common.noData}</Tag>;
        const pct = Math.round(result.normalizedScore * 10);
        const color = pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error';
        return <Progress percent={pct} size="small" strokeColor={color === 'success' ? '#52c41a' : color === 'warning' ? '#faad14' : '#ff4d4f'} format={() => `${result.normalizedScore}/10`} />;
      }
    },
    { title: t.dashboard.highRisks, key: 'risks',
      render: (_: unknown, record: RepoConfig) => {
        const result = results[record.id]?.[0];
        if (!result) return '-';
        return (
          <Space>
            {result.summary.highRisk > 0 && <Tag color="red"><BugOutlined /> {result.summary.highRisk} {t.checks.highRisk}</Tag>}
            {result.summary.mediumRisk > 0 && <Tag color="orange"><WarningOutlined /> {result.summary.mediumRisk} {t.checks.mediumRisk}</Tag>}
          </Space>
        );
      }
    },
    { title: t.repos.lastCheck, dataIndex: 'lastChecked', key: 'lastChecked',
      render: (v: string) => v ? new Date(v).toLocaleString() : '-'
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, color: '#e6f0ff' }}>
          <SafetyCertificateOutlined /> {t.dashboard.title}
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>{t.common.refresh}</Button>
          <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={runAllChecks}>
            {t.dashboard.runAllChecks}
          </Button>
        </Space>
      </div>

      <div className="dashboard-grid">
        <Card className="card stat-card">
          <Statistic title={t.dashboard.totalRepos} value={repos.length} prefix={<BranchesOutlined />} />
        </Card>
        <Card className="card stat-card">
          <Statistic title={t.dashboard.avgScore} value={avgScore} suffix="/ 10" prefix={<SafetyCertificateOutlined />}
            valueStyle={{ color: avgScore >= 8 ? '#52c41a' : avgScore >= 5 ? '#faad14' : '#ff4d4f' }} />
        </Card>
        <Card className="card stat-card">
          <Statistic title={t.dashboard.checksPassed} value={totalPass} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} />
        </Card>
        <Card className="card stat-card">
          <Statistic title={t.dashboard.checksFailed} value={totalFail} prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />} />
        </Card>
        <Card className="card stat-card">
          <Statistic title={t.dashboard.highRisks} value={totalCritical + totalHigh} prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
            valueStyle={{ color: (totalCritical + totalHigh) > 0 ? '#ff4d4f' : '#52c41a' }} />
        </Card>
        <Card className="card stat-card">
          <Statistic title={t.dashboard.mediumRisks} value={totalMedium} prefix={<WarningOutlined style={{ color: '#faad14' }} />} />
        </Card>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card className="card" title={t.dashboard.securityRadar} style={{ height: 400 }}>
            {radarData.length > 0 ? (
              <ReactECharts option={radarOption} style={{ height: 300 }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 80, color: '#8ba3c7' }}>
                {t.dashboard.noCheckData}
              </div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card className="card" title={t.dashboard.scoreDistribution} style={{ height: 400 }}>
            {allResults.length > 0 ? (
              <ReactECharts option={barOption} style={{ height: 300 }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 80, color: '#8ba3c7' }}>
                {t.dashboard.noRepos}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card className="card" title={t.dashboard.repoOverview}>
        <Table
          dataSource={repos}
          columns={repoColumns}
          rowKey="id"
          pagination={false}
          style={{ background: 'transparent' }}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
