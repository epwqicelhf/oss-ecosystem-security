import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Select, Progress, Tag, Collapse, Typography, Space, Badge, Button, List, Tooltip, Spin, Empty } from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, MinusCircleOutlined,
  BugOutlined, ToolOutlined, LinkOutlined, ArrowUpOutlined, ClockCircleOutlined,
  FileTextOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { reposApi, checksApi } from '../api';
import type { RepoConfig, CheckResult, CheckProbe } from '../api';
import { useHistoryStore } from '../stores/history';
import { useLanguageStore } from '../stores/language';
import { useSearchParams } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

const CheckResults: React.FC = () => {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [results, setResults] = useState<CheckResult[]>([]);
  const [currentResult, setCurrentResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const { addAction } = useHistoryStore();
  const { t, current: lang } = useLanguageStore();
  const [searchParams] = useSearchParams();
  const isZh = lang === 'zh-CN';

  useEffect(() => {
    loadRepos();
    const repoId = searchParams.get('repo');
    if (repoId) setSelectedRepo(repoId);
  }, []);

  useEffect(() => {
    if (selectedRepo) loadResults(selectedRepo);
  }, [selectedRepo]);

  const loadRepos = async () => {
    try {
      const data = await reposApi.list();
      setRepos(data);
    } catch { /* ignore */ }
  };

  const loadResults = async (repoId: string) => {
    setLoading(true);
    try {
      const data = await checksApi.getResults(repoId);
      setResults(data);
      if (data.length > 0) setCurrentResult(data[0]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const runCheck = async () => {
    if (!selectedRepo) return;
    setChecking(true);
    try {
      const result = await checksApi.run(selectedRepo);
      addAction({
        type: 'run-check',
        description: t.checks.ranCheck
      });
      setCurrentResult(result);
      loadResults(selectedRepo);
    } catch (err: any) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const outcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'pass': return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />;
      case 'fail': return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />;
      case 'warning': return <WarningOutlined style={{ color: '#faad14', fontSize: 20 }} />;
      default: return <MinusCircleOutlined style={{ color: '#8c8c8c', fontSize: 20 }} />;
    }
  };

  const severityColor = (s: string) => {
    return { critical: '#cf1322', high: '#ff4d4f', medium: '#faad14', low: '#1890ff', info: '#52c41a' }[s] || '#8c8c8c';
  };

  const severityBg = (s: string) => {
    return { critical: '#cf1322', high: '#ff4d4f', medium: '#faad14', low: '#1890ff' }[s] || '#8c8c8c';
  };

  const renderScoreGauge = (score: number) => {
    const color = score >= 8 ? '#52c41a' : score >= 5 ? '#faad14' : '#ff4d4f';
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0, max: 10,
        pointer: { show: false },
        progress: { show: true, width: 18, roundCap: true, itemStyle: { color } },
        axisLine: { lineStyle: { width: 18, color: [[1, '#1a3a5c']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: { show: false },
        detail: {
          fontSize: 32, fontWeight: 700, color,
          offsetCenter: [0, '0%'],
          formatter: '{value}'
        },
        data: [{ value: score }]
      }]
    };
  };

  const renderProbeCard = (probe: CheckProbe) => {
    const scorePercent = probe.maxScore > 0 ? Math.round((probe.score / probe.maxScore) * 100) : 0;
    const expectedScore = probe.remediation ? probe.score + probe.remediation.expectedScoreImprovement : probe.score;
    const sevColor = severityBg(probe.severity);

    return (
      <Card
        key={probe.id}
        className={`card probe-card ${probe.outcome}`}
        size="small"
        title={
          <Space>
            {outcomeIcon(probe.outcome)}
            <Text strong style={{ color: '#e6f0ff' }}>{isZh ? probe.name_zh : probe.name}</Text>
            <Tag color={sevColor} style={{ fontWeight: 700 }}>{probe.severity.toUpperCase()}</Tag>
            <Tag>w: {probe.weight}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Progress type="circle" percent={scorePercent} size={36}
              strokeColor={probe.outcome === 'pass' ? '#52c41a' : probe.outcome === 'fail' ? '#ff4d4f' : '#faad14'} />
            <Text style={{ fontSize: 16, fontWeight: 700 }}>{probe.score}/{probe.maxScore}</Text>
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {isZh ? probe.description_zh : probe.description}
        </Paragraph>

        {probe.scoring_rules && probe.scoring_rules.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 13, color: '#1890ff' }}>
              {isZh ? '评分规则明细' : 'Scoring Rules'}
            </Text>
            <div style={{ marginTop: 8 }}>
              {probe.scoring_rules.map((rule) => (
                <div key={rule.id} style={{
                  padding: '10px 14px', marginBottom: 8, borderRadius: 8,
                  background: rule.passed ? 'rgba(82,196,26,0.06)' : 'rgba(255,77,79,0.06)',
                  border: `1px solid ${rule.passed ? 'rgba(82,196,26,0.25)' : 'rgba(255,77,79,0.25)'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Space>
                      {rule.passed ?
                        <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
                        <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                      }
                      <Text strong style={{ fontSize: 13, color: '#e6f0ff' }}>
                        {isZh ? rule.name_zh : rule.name}
                      </Text>
                    </Space>
                    <Text style={{ fontSize: 13, fontWeight: 700, color: rule.passed ? '#52c41a' : '#ff4d4f' }}>
                      {rule.points_earned}/{rule.max_points}
                      {rule.points_deducted > 0 && (
                        <span style={{ color: '#ff4d4f', marginLeft: 6 }}>-{rule.points_deducted}</span>
                      )}
                    </Text>
                  </div>
                  <div style={{ fontSize: 12, color: '#8ba3c7', lineHeight: 1.6 }}>
                    <div><strong>{isZh ? '检查方法: ' : 'Check Method: '}</strong>{isZh ? rule.check_method_zh : rule.check_method}</div>
                    <div><strong>{isZh ? '通过条件: ' : 'Pass Condition: '}</strong>{isZh ? rule.pass_condition_zh : rule.pass_condition}</div>
                    {!rule.passed && (
                      <div style={{ color: '#ff4d4f' }}>
                        <strong>{isZh ? '扣分原因: ' : 'Deduction: '}</strong>{isZh ? rule.deduction_reason_zh : rule.deduction_reason}
                        {' '}(-{rule.deduction} {isZh ? '分' : 'pts'})
                      </div>
                    )}
                    {rule.reference_format && !rule.passed && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', color: '#1890ff' }}>
                          {isZh ? '参考格式' : 'Reference Format'}
                        </summary>
                        <pre style={{
                          fontSize: 11, padding: 8, marginTop: 4, borderRadius: 4,
                          background: 'rgba(0,0,0,0.3)', color: '#e6f0ff',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                        }}>
                          {isZh && rule.reference_format_zh ? rule.reference_format_zh : rule.reference_format}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {probe.findings.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13, color: '#8ba3c7' }}>
              <FileTextOutlined /> {t.checks.findings} ({probe.findings.length})
            </Text>
            <List
              size="small"
              dataSource={probe.findings.slice(0, 10)}
              renderItem={(f) => (
                <List.Item className={`finding-item ${f.severity}`} style={{ padding: '6px 12px' }}>
                  <Space>
                    <Badge color={severityColor(f.severity)} />
                    <Text style={{ fontSize: 12, color: '#e6f0ff' }}>{f.message}</Text>
                    {f.path && <Tag style={{ fontSize: 11 }}>{f.path}{f.line ? `:${f.line}` : ''}</Tag>}
                  </Space>
                </List.Item>
              )}
            />
            {probe.findings.length > 10 && (
              <Text type="secondary" style={{ fontSize: 12 }}>{t.checks.moreFindings.replace('{count}', String(probe.findings.length - 10))}</Text>
            )}
          </div>
        )}

        {probe.remediation && (
          <div className="remediation-steps">
            <Space style={{ marginBottom: 8 }}>
              <ToolOutlined style={{ color: '#1890ff' }} />
              <Text strong style={{ color: '#1890ff' }}>{t.checks.remediation}</Text>
              <Tag color={probe.remediation.effort === 'low' ? 'green' : probe.remediation.effort === 'medium' ? 'orange' : 'red'}>
                {t.checks.effort}: {t.checks[`effort${probe.remediation.effort.charAt(0).toUpperCase() + probe.remediation.effort.slice(1)}` as keyof typeof t.checks]}
              </Tag>
              {probe.remediation.expectedScoreImprovement > 0 && (
                <Tooltip title={t.checks.expectedImprovement}>
                  <Tag color="blue" icon={<ArrowUpOutlined />}>
                    +{probe.remediation.expectedScoreImprovement} {t.checks.points}
                  </Tag>
                </Tooltip>
              )}
              <Tag color="cyan">
                {t.checks.expected}: {expectedScore}/{probe.maxScore}
              </Tag>
            </Space>
            <Paragraph style={{ color: '#8ba3c7', marginBottom: 8 }}>
              {isZh && probe.remediation.description_zh ? probe.remediation.description_zh : probe.remediation.description}
            </Paragraph>
            <ol style={{ paddingLeft: 20, color: '#e6f0ff', fontSize: 13 }}>
              {(isZh && probe.remediation.steps_zh ? probe.remediation.steps_zh : probe.remediation.steps).map((step, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{step}</li>
              ))}
            </ol>
            {probe.remediation.references.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {probe.remediation.references.map((ref, i) => (
                  <a key={i} href={ref} target="_blank" rel="noopener noreferrer" style={{ marginRight: 12, fontSize: 12 }}>
                    <LinkOutlined /> {t.checks.reference.replace('{n}', String(i + 1))}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, color: '#e6f0ff' }}>
          <BugOutlined /> {t.checks.title}
        </Title>
        <Space>
          <Select
            value={selectedRepo}
            onChange={setSelectedRepo}
            placeholder={t.checks.selectRepo}
            style={{ width: 260 }}
          >
            {repos.map(r => (
              <Select.Option key={r.id} value={r.id}>{r.name}</Select.Option>
            ))}
          </Select>
          <Button type="primary" onClick={runCheck} loading={checking} disabled={!selectedRepo}>
            {t.checks.runCheck}
          </Button>
        </Space>
      </div>

      {!currentResult ? (
        <Card className="card">
          <Empty description={t.checks.selectAndRun} />
        </Card>
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card className="card" style={{ textAlign: 'center' }}>
                <ReactECharts option={renderScoreGauge(currentResult.normalizedScore)} style={{ height: 180 }} />
                <Text strong style={{ fontSize: 14 }}>{t.checks.overallScore}</Text>
              </Card>
            </Col>
            <Col span={18}>
              <Card className="card" title={t.checks.checkSummary}>
                <Row gutter={16}>
                  <Col span={6}>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: '#52c41a' }}>
                        <CheckCircleOutlined /> {currentResult.summary.pass}
                      </div>
                      <div className="stat-label">{t.checks.passed}</div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: '#ff4d4f' }}>
                        <CloseCircleOutlined /> {currentResult.summary.fail}
                      </div>
                      <div className="stat-label">{t.checks.failed}</div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: '#faad14' }}>
                        <WarningOutlined /> {currentResult.summary.warning}
                      </div>
                      <div className="stat-label">{t.checks.warnings}</div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: '#8c8c8c' }}>
                        <MinusCircleOutlined /> {currentResult.summary.notApplicable}
                      </div>
                      <div className="stat-label">{t.checks.notApplicable}</div>
                    </div>
                  </Col>
                </Row>
                <Row gutter={16} style={{ marginTop: 16 }}>
                  <Col span={6}>
                    <Tag color="#cf1322" style={{ padding: '8px 16px', fontSize: 14 }}>
                      Critical: {currentResult.summary.criticalRisk}
                    </Tag>
                  </Col>
                  <Col span={6}>
                    <Tag color="red" style={{ padding: '8px 16px', fontSize: 14 }}>
                      <BugOutlined /> {t.checks.highRisk}: {currentResult.summary.highRisk}
                    </Tag>
                  </Col>
                  <Col span={6}>
                    <Tag color="orange" style={{ padding: '8px 16px', fontSize: 14 }}>
                      <WarningOutlined /> {t.checks.mediumRisk}: {currentResult.summary.mediumRisk}
                    </Tag>
                  </Col>
                  <Col span={8}>
                    <Tag color="blue" style={{ padding: '8px 16px', fontSize: 14 }}>
                      <InfoCircleOutlined /> {t.checks.lowRisk}: {currentResult.summary.lowRisk}
                    </Tag>
                  </Col>
                </Row>
                <div style={{ marginTop: 12, fontSize: 12, color: '#8ba3c7' }}>
                  <ClockCircleOutlined /> {t.checks.checked}: {new Date(currentResult.checkedAt).toLocaleString()} |
                  {t.checks.score}: {currentResult.totalWeightedScore}/{currentResult.totalWeightSum * 10} ({t.checks.normalized}: {currentResult.normalizedScore}/10)
                  <div style={{ marginTop: 4, fontStyle: 'italic' }}>
                    {isZh ? currentResult.scoreFormula_zh : currentResult.scoreFormula}
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {results.length > 1 && (
            <Card className="card" size="small" style={{ marginBottom: 16 }}>
              <Space wrap>
                <Text type="secondary">{t.checks.history}:</Text>
                {results.map((r, i) => (
                  <Button
                    key={i}
                    size="small"
                    type={currentResult.checkedAt === r.checkedAt ? 'primary' : 'default'}
                    onClick={() => setCurrentResult(r)}
                  >
                    {new Date(r.checkedAt).toLocaleString()} ({r.normalizedScore})
                  </Button>
                ))}
              </Space>
            </Card>
          )}

          <Collapse
            defaultActiveKey={currentResult.probes.filter(p => p.outcome === 'fail').map(p => p.id)}
            items={[
              {
                key: '__failed',
                label: <Text strong style={{ color: '#ff4d4f' }}><CloseCircleOutlined /> {t.checks.failedChecks} ({currentResult.probes.filter(p => p.outcome === 'fail').length})</Text>,
                children: currentResult.probes.filter(p => p.outcome === 'fail').map(renderProbeCard)
              },
              {
                key: '__warning',
                label: <Text strong style={{ color: '#faad14' }}><WarningOutlined /> {t.checks.warningChecks} ({currentResult.probes.filter(p => p.outcome === 'warning').length})</Text>,
                children: currentResult.probes.filter(p => p.outcome === 'warning').map(renderProbeCard)
              },
              {
                key: '__passed',
                label: <Text strong style={{ color: '#52c41a' }}><CheckCircleOutlined /> {t.checks.passedChecks} ({currentResult.probes.filter(p => p.outcome === 'pass').length})</Text>,
                children: currentResult.probes.filter(p => p.outcome === 'pass').map(renderProbeCard)
              }
            ]}
          />
        </>
      )}
    </div>
  );
};

export default CheckResults;
