import React, { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, Progress, Tag, Collapse, Tabs, Typography, Space, Badge, Button, Tooltip, Spin, Empty } from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, MinusCircleOutlined,
  BugOutlined, ToolOutlined, LinkOutlined, ArrowUpOutlined, ClockCircleOutlined,
  FileTextOutlined, InfoCircleOutlined, DownOutlined, UpOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { reposApi, checksApi } from '../api';
import type { RepoConfig, CheckProbe } from '../api';
import { useHistoryStore } from '../stores/history';
import { useLanguageStore } from '../stores/language';
import { useCheckStore } from '../stores/checkStore';
import { useSearchParams } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

const platformColor: Record<string, string> = { atomgit: 'blue', github: 'green', gitlab: 'orange', gitcode: 'purple' };

const CheckResults: React.FC = () => {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [expandedPRSections, setExpandedPRSections] = useState<Set<string>>(new Set());
  const { addAction } = useHistoryStore();
  const { t, current: lang } = useLanguageStore();
  const [searchParams] = useSearchParams();
  const isZh = lang === 'zh-CN';

  const PR_LIST_PAGE_SIZE = 5;

  const togglePRSection = (sectionKey: string) => {
    setExpandedPRSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const { selectedRepoId, results, currentResult, expandedKeys, sidebarGroupKeys, setSelectedRepoId, setResults, setCurrentResult, setExpandedKeys, setSidebarGroupKeys } = useCheckStore();

  useEffect(() => {
    loadRepos();
  }, []);

  useEffect(() => {
    const repoId = searchParams.get('repo');
    if (repoId) setSelectedRepoId(repoId);
  }, [searchParams]);

  useEffect(() => {
    if (selectedRepoId) loadResults(selectedRepoId);
  }, [selectedRepoId]);

  const grouped = useMemo(() => {
    const map: Record<string, { platform: string; owner: string; repos: RepoConfig[] }> = {};
    for (const r of repos) {
      const key = `${r.platform}/${r.owner}`;
      if (!map[key]) map[key] = { platform: r.platform, owner: r.owner, repos: [] };
      map[key].repos.push(r);
    }
    return Object.values(map).sort((a, b) => b.repos.length - a.repos.length);
  }, [repos]);

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
    if (!selectedRepoId) return;
    setChecking(true);
    try {
      const result = await checksApi.run(selectedRepoId);
      addAction({ type: 'run-check', description: t.checks.ranCheck });
      setCurrentResult(result);
      loadResults(selectedRepoId);
    } catch (err: any) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  const outcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'pass': return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />;
      case 'fail': return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />;
      case 'warning': return <WarningOutlined style={{ color: '#faad14', fontSize: 20 }} />;
      default: return <MinusCircleOutlined style={{ color: '#8c8c8c', fontSize: 20 }} />;
    }
  };

  const severityColor = (s: string) => {
    return { critical: '#cf1322', high: '#ff4d4f', medium: '#faad14', low: '#3b82f6', info: '#52c41a' }[s] || '#8c8c8c';
  };

  const severityBg = (s: string) => {
    return { critical: '#cf1322', high: '#ff4d4f', medium: '#faad14', low: '#3b82f6' }[s] || '#8c8c8c';
  };

  const scrollToProbe = (probeId: string) => {
    const el = document.getElementById(`probe-${probeId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.style.boxShadow = '0 0 0 2px #3b82f6, 0 4px 24px rgba(59,130,246,0.3)';
      setTimeout(() => { el.style.boxShadow = ''; }, 2000);
    }
  };

  const renderProbeNav = (probes: CheckProbe[], color: string) => (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10, padding: '8px 12px',
      background: 'rgba(10,22,44,0.92)', backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(59,130,246,0.15)', marginBottom: 12, borderRadius: '8px 8px 0 0',
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
    }}>
      <Text style={{ fontSize: 11, color: '#b0c8e8', marginRight: 4, flexShrink: 0 }}>
        {isZh ? '快速定位:' : 'Jump to:'}
      </Text>
      {probes.map((p) => (
        <Tag
          key={p.id}
          color={color}
          style={{ cursor: 'pointer', fontSize: 11, margin: 0, transition: 'all 0.2s' }}
          onClick={() => scrollToProbe(p.id)}
        >
          {isZh ? p.name_zh : p.name}
          <span style={{ marginLeft: 4, opacity: 0.7 }}>{p.score}/{p.maxScore}</span>
        </Tag>
      ))}
    </div>
  );

  const renderProbeSection = (probes: CheckProbe[]) => (
    <>
      {probes.length > 3 && renderProbeNav(probes, probes[0]?.outcome === 'fail' ? '#ff4d4f' : probes[0]?.outcome === 'warning' ? '#faad14' : '#52c41a')}
      {probes.map(renderProbeCard)}
    </>
  );

  const renderScoreGauge = (score: number) => {
    const color = score >= 8 ? '#52c41a' : score >= 5 ? '#faad14' : '#ff4d4f';
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 10,
        pointer: { show: false },
        progress: { show: true, width: 18, roundCap: true, itemStyle: { color } },
        axisLine: { lineStyle: { width: 18, color: [[1, 'rgba(59,130,246,0.2)']] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, title: { show: false },
        detail: { fontSize: 32, fontWeight: 700, color, offsetCenter: [0, '0%'], formatter: '{value}' },
        data: [{ value: score }]
      }]
    };
  };

  const renderScoringRules = (probe: CheckProbe) => {
    if (!probe.scoring_rules || probe.scoring_rules.length === 0) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginTop: 8 }}>
          {probe.scoring_rules.map((rule) => (
            <div key={rule.id} style={{
              padding: '10px 14px', marginBottom: 8, borderRadius: 8,
              background: rule.passed ? 'rgba(82,196,26,0.06)' : 'rgba(255,77,79,0.06)',
              border: `1px solid ${rule.passed ? 'rgba(82,196,26,0.25)' : 'rgba(255,77,79,0.25)'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Space>
                  {rule.passed ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <MinusCircleOutlined style={{ color: '#8c8c8c' }} />}
                  <Text strong style={{ fontSize: 13, color: '#f0f6ff' }}>{isZh ? rule.name_zh : rule.name}</Text>
                  {rule.max_points === 0 && <Tag color="default" style={{ fontSize: 10 }}>{isZh ? '不扣分' : 'No Deduction'}</Tag>}
                </Space>
                {rule.max_points > 0 && (
                  <Text style={{ fontSize: 13, fontWeight: 700, color: rule.passed ? '#52c41a' : '#ff4d4f' }}>
                    {rule.points_earned}/{rule.max_points}
                    {rule.points_deducted > 0 && <span style={{ color: '#ff4d4f', marginLeft: 6 }}>-{rule.points_deducted}</span>}
                  </Text>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#b0c8e8', lineHeight: 1.6 }}>
                <div><strong>{isZh ? '检查方法: ' : 'Check Method: '}</strong>{isZh ? rule.check_method_zh : rule.check_method}</div>
                <div><strong>{isZh ? '通过条件: ' : 'Pass Condition: '}</strong>{isZh ? rule.pass_condition_zh : rule.pass_condition}</div>
                {rule.max_points > 0 && !rule.passed && (
                  <div style={{ color: '#ff4d4f' }}>
                    <strong>{isZh ? '扣分原因: ' : 'Deduction: '}</strong>{isZh ? rule.deduction_reason_zh : rule.deduction_reason}
                    {' '}(-{rule.deduction} {isZh ? '分' : 'pts'})
                  </div>
                )}
                {rule.max_points === 0 && (
                  <div style={{ color: rule.passed ? '#52c41a' : '#8c8c8c' }}>
                    <strong>{isZh ? '检查结果: ' : 'Result: '}</strong>{isZh ? rule.deduction_reason_zh : rule.deduction_reason}
                  </div>
                )}
                {rule.detection_fields && rule.detection_fields.length > 0 && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', color: '#3b82f6' }}>{isZh ? `检测路径 (${rule.detection_fields.length})` : `Check Paths (${rule.detection_fields.length})`}</summary>
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {rule.detection_fields.map((df, di) => (
                        <Tag key={di} style={{ fontSize: 10, margin: 0, fontFamily: 'monospace' }}>{df.field}</Tag>
                      ))}
                    </div>
                  </details>
                )}
                {rule.reference_format && !rule.passed && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: 'pointer', color: '#3b82f6' }}>{isZh ? '参考格式' : 'Reference Format'}</summary>
                    <pre style={{ fontSize: 11, padding: 8, marginTop: 4, borderRadius: 4, background: 'rgba(0,0,0,0.3)', color: '#f0f6ff', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {isZh && rule.reference_format_zh ? rule.reference_format_zh : rule.reference_format}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFindings = (probe: CheckProbe) => {
    if (probe.findings.length === 0) return null;
    const summaryLines = probe.findings.filter(f => f.severity === 'info' && f.path === '.' && !f.message.includes('[SCORE:'));
    const passedItems = probe.findings.filter(f => f.message.includes('[SCORE:+'));
    const failedItems = probe.findings.filter(f => f.message.includes('[SCORE:-'));
    const otherItems = probe.findings.filter(f =>
      !f.message.includes('[SCORE:') &&
      !(f.severity === 'info' && f.path === '.' && !f.message.includes('[SCORE:'))
    );

    const extractScore = (msg: string) => {
      const m = msg.match(/\[SCORE:([+-])(\d+\.?\d*)\]/);
      return m ? { sign: m[1], pts: m[2] } : null;
    };

    const parsePRDetail = (msg: string) => {
      const lines = msg.split('\n');
      const result: Record<string, string> = {};
      for (const line of lines) {
        const l = line.trim();
        if (l.startsWith('[SCORE:')) continue;
        else if (l.startsWith('PR #')) result.pr = l;
        else if (l.startsWith('Author:')) result.author = l.replace('Author: ', '');
        else if (l.startsWith('Approval count:')) result.approval = l.replace('Approval count: ', '');
        else if (l.startsWith('Approved by:')) result.approvedBy = l.replace('Approved by: ', '');
        else if (l.startsWith('Assigned reviewers')) result.reviewers = l.replace('Assigned reviewers (not approved): ', '');
        else if (l.startsWith('Merged by') || l.startsWith('State:')) result.state = l;
        else if (l.startsWith('Labels:')) result.labels = l.replace('Labels: ', '');
        else if (l.startsWith('http')) result.url = l;
      }
      return result;
    };

    return (
      <div style={{ marginBottom: 12 }}>
        {summaryLines.map((f, i) => (
          <div key={`s-${i}`} style={{ padding: '8px 12px', marginTop: 6, borderRadius: 6, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>
            {f.message}
          </div>
        ))}

        {passedItems.length > 0 && (() => {
          const sectionKey = `${probe.id}-passed`;
          const isExpanded = expandedPRSections.has(sectionKey);
          const displayItems = isExpanded ? passedItems : passedItems.slice(0, PR_LIST_PAGE_SIZE);
          const hasMore = passedItems.length > PR_LIST_PAGE_SIZE;

          return (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 12px', background: 'rgba(82,196,26,0.1)', borderRadius: '6px 6px 0 0', border: '1px solid rgba(82,196,26,0.3)', borderBottom: 'none' }}>
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                <Text strong style={{ color: '#52c41a', fontSize: 14 }}>{isZh ? '审核通过' : 'Reviewed'}</Text>
                <Tag color="success">{passedItems.length} PRs</Tag>
              </div>
              <div style={{ border: '1px solid rgba(82,196,26,0.3)', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
                {displayItems.map((f, i) => {
                  const score = extractScore(f.message);
                  const detail = parsePRDetail(f.message);
                  return (
                    <div key={`p-${i}`} style={{ padding: '10px 14px', borderBottom: i < displayItems.length - 1 ? '1px solid rgba(82,196,26,0.1)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(82,196,26,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Space>
                          <Tag color="success" style={{ fontWeight: 700, fontSize: 13 }}>+{score?.pts || '0'} {isZh ? '分' : 'pts'}</Tag>
                          <Text strong style={{ fontSize: 13, color: '#f0f6ff' }}>{detail.pr || ''}</Text>
                          {f.path && <Tag style={{ fontSize: 11 }}>{f.path}</Tag>}
                        </Space>
                      </div>
                      <div style={{ fontSize: 12, color: '#b0c8e8', lineHeight: 1.8 }}>
                        {detail.author && <div>{isZh ? '作者: ' : 'Author: '}{detail.author}</div>}
                        {detail.approval && <div>{isZh ? '审核: ' : 'Review: '}Approval count: {detail.approval}</div>}
                        {detail.approvedBy && <div>Approved by: {detail.approvedBy}</div>}
                        {detail.state && <div>{isZh ? '状态: ' : 'Status: '}{detail.state}</div>}
                        {detail.labels && <div style={{ fontSize: 11 }}>{detail.labels}</div>}
                        {detail.url && <div><a href={detail.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>{detail.url}</a></div>}
                      </div>
                    </div>
                  );
                })}
                {hasMore && (
                  <div style={{ padding: '8px 12px', textAlign: 'center', borderTop: '1px solid rgba(82,196,26,0.1)' }}>
                    <Button type="link" size="small" icon={isExpanded ? <UpOutlined /> : <DownOutlined />} onClick={() => togglePRSection(sectionKey)}>
                      {isExpanded ? (isZh ? '收起' : 'Collapse') : (isZh ? `展开全部 (${passedItems.length})` : `Show All (${passedItems.length})`)}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {failedItems.length > 0 && (() => {
          const sectionKey = `${probe.id}-failed`;
          const isExpanded = expandedPRSections.has(sectionKey);
          const displayItems = isExpanded ? failedItems : failedItems.slice(0, PR_LIST_PAGE_SIZE);
          const hasMore = failedItems.length > PR_LIST_PAGE_SIZE;

          return (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 12px', background: 'rgba(255,77,79,0.1)', borderRadius: '6px 6px 0 0', border: '1px solid rgba(255,77,79,0.3)', borderBottom: 'none' }}>
                <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                <Text strong style={{ color: '#ff4d4f', fontSize: 14 }}>{isZh ? '未通过审核' : 'Not Reviewed'}</Text>
                <Tag color="error">{failedItems.length} PRs</Tag>
              </div>
              <div style={{ border: '1px solid rgba(255,77,79,0.3)', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
                {displayItems.map((f, i) => {
                  const score = extractScore(f.message);
                  const detail = parsePRDetail(f.message);
                  return (
                    <div key={`f-${i}`} style={{ padding: '10px 14px', borderBottom: i < displayItems.length - 1 ? '1px solid rgba(255,77,79,0.1)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,77,79,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Space>
                          <Tag color="error" style={{ fontWeight: 700, fontSize: 13 }}>-{score?.pts || '0'} {isZh ? '分' : 'pts'}</Tag>
                          <Text strong style={{ fontSize: 13, color: '#f0f6ff' }}>{detail.pr || ''}</Text>
                          {f.path && <Tag style={{ fontSize: 11 }}>{f.path}</Tag>}
                        </Space>
                      </div>
                      <div style={{ fontSize: 12, color: '#b0c8e8', lineHeight: 1.8 }}>
                        {detail.author && <div>{isZh ? '作者: ' : 'Author: '}{detail.author}</div>}
                        {detail.approval && <div>{isZh ? '审核: ' : 'Review: '}Approval count: {detail.approval}</div>}
                        {detail.state && <div>{isZh ? '状态: ' : 'Status: '}{detail.state}</div>}
                        {detail.reviewers && <div>Assigned reviewers (not approved): {detail.reviewers}</div>}
                        {detail.labels && <div style={{ fontSize: 11 }}>{detail.labels}</div>}
                        {detail.url && <div><a href={detail.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>{detail.url}</a></div>}
                      </div>
                    </div>
                  );
                })}
                {hasMore && (
                  <div style={{ padding: '8px 12px', textAlign: 'center', borderTop: '1px solid rgba(255,77,79,0.1)' }}>
                    <Button type="link" size="small" icon={isExpanded ? <UpOutlined /> : <DownOutlined />} onClick={() => togglePRSection(sectionKey)}>
                      {isExpanded ? (isZh ? '收起' : 'Collapse') : (isZh ? `展开全部 (${failedItems.length})` : `Show All (${failedItems.length})`)}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {otherItems.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {otherItems.map((f, i) => (
              <div key={`o-${i}`} className={`finding-item ${f.severity}`} style={{ padding: '6px 12px' }}>
                <Space>
                  <Badge color={severityColor(f.severity)} />
                  <Text style={{ fontSize: 12, color: '#f0f6ff' }}>{f.message}</Text>
                  {f.path && <Tag style={{ fontSize: 11 }}>{f.path}</Tag>}
                </Space>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderRemediation = (probe: CheckProbe) => {
    const expectedScore = probe.remediation ? probe.score + probe.remediation.expectedScoreImprovement : probe.score;
    return (
      <>
        {probe.remediation && (
          <div className="remediation-steps">
            <Space style={{ marginBottom: 8 }}>
              <ToolOutlined style={{ color: '#3b82f6' }} />
              <Text strong style={{ color: '#3b82f6' }}>{t.checks.remediation}</Text>
              <Tag color={probe.remediation.effort === 'low' ? 'green' : probe.remediation.effort === 'medium' ? 'orange' : 'red'}>
                {t.checks.effort}: {t.checks[`effort${probe.remediation.effort.charAt(0).toUpperCase() + probe.remediation.effort.slice(1)}` as keyof typeof t.checks]}
              </Tag>
              {probe.remediation.expectedScoreImprovement > 0 && (
                <Tooltip title={t.checks.expectedImprovement}>
                  <Tag color="blue" icon={<ArrowUpOutlined />}>+{probe.remediation.expectedScoreImprovement} {t.checks.points}</Tag>
                </Tooltip>
              )}
              <Tag color="cyan">{t.checks.expected}: {expectedScore}/{probe.maxScore}</Tag>
            </Space>
            <Paragraph style={{ color: '#b0c8e8', marginBottom: 8 }}>
              {isZh && probe.remediation.description_zh ? probe.remediation.description_zh : probe.remediation.description}
            </Paragraph>
            <ol style={{ paddingLeft: 20, color: '#f0f6ff', fontSize: 13 }}>
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

        {probe.reference_items && probe.reference_items.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginTop: 8 }}>
              {probe.reference_items.map((ref, i) => (
                <div key={i} style={{
                  padding: '10px 14px', marginBottom: 6, borderRadius: 6,
                  background: ref.found ? 'rgba(82,196,26,0.06)' : 'rgba(140,140,140,0.06)',
                  border: `1px solid ${ref.found ? 'rgba(82,196,26,0.2)' : 'rgba(140,140,140,0.2)'}`
                }}>
                  <Space>
                    {ref.found ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <MinusCircleOutlined style={{ color: '#8c8c8c' }} />}
                    <Text style={{ fontSize: 13 }}>{isZh ? ref.name_zh : ref.name}</Text>
                    <Tag color={ref.found ? 'green' : 'default'}>{ref.found ? (isZh ? '已找到' : 'Found') : (isZh ? '未找到' : 'Not Found')}</Tag>
                  </Space>
                  {ref.paths_grouped && ref.paths_grouped.length > 0 ? (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11, color: '#b0c8e8', marginBottom: 4 }}>
                        {isZh ? '检测路径:' : 'Checked Paths:'}
                      </div>
                      {ref.paths_grouped.map((g, gi) => (
                        <div key={gi} style={{ marginBottom: 4 }}>
                          <Tag color={g.group === 'common' ? 'default' : 'blue'} style={{ fontSize: 10, marginRight: 4 }}>{isZh ? g.group_zh : g.group}</Tag>
                          <span style={{ fontSize: 11, color: '#b0c8e8' }}>{g.paths.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : ref.paths_checked.length > 0 ? (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#b0c8e8' }}>
                      {isZh ? '检测路径: ' : 'Paths: '}{ref.paths_checked.join(', ')}
                    </div>
                  ) : null}
                  {ref.reference_format && !ref.found && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: 'pointer', color: '#3b82f6', fontSize: 12 }}>{isZh ? '查看参考格式' : 'View Reference Format'}</summary>
                      <pre style={{ fontSize: 11, padding: 8, marginTop: 4, borderRadius: 4, background: 'rgba(0,0,0,0.3)', color: '#f0f6ff', whiteSpace: 'pre-wrap' }}>
                        {isZh && ref.reference_format_zh ? ref.reference_format_zh : ref.reference_format}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderProbeCard = (probe: CheckProbe) => {
    const scorePercent = probe.maxScore > 0 ? Math.round((probe.score / probe.maxScore) * 100) : 0;
    const sevColor = severityBg(probe.severity);
    const isFailed = probe.outcome === 'fail' || probe.outcome === 'warning';

    const failedRulesCount = probe.scoring_rules ? probe.scoring_rules.filter(r => !r.passed && r.max_points > 0).length : 0;
    const totalFindings = probe.findings.length;
    const hasRemediation = !!(probe.remediation || (probe.reference_items && probe.reference_items.length > 0));

    return (
      <Card
        key={probe.id}
        id={`probe-${probe.id}`}
        className={`card probe-card ${probe.outcome}`}
        size="small"
        title={
          <Space>
            {outcomeIcon(probe.outcome)}
            <Text strong style={{ color: '#f0f6ff' }}>{isZh ? probe.name_zh : probe.name}</Text>
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

        {isFailed ? (
          <div style={{
            marginTop: 12,
            border: '1px solid rgba(255, 77, 79, 0.3)',
            borderRadius: 6,
            background: 'rgba(255, 77, 79, 0.02)',
          }}>
            <Tabs
              type="card"
              defaultActiveKey="result"
              style={{ padding: '0 16px' }}
              tabBarStyle={{ marginBottom: 0, borderBottom: '1px solid rgba(59,130,246,0.2)' }}
              items={[
                {
                  key: 'result',
                  label: <Space>
                    <CheckCircleOutlined style={{ color: failedRulesCount > 0 ? '#ff4d4f' : '#52c41a' }} />
                    <Text strong style={{ color: '#f0f6ff' }}>{isZh ? '检查结果' : 'Check Result'}</Text>
                    {failedRulesCount > 0 && <Tag color="error">{failedRulesCount} {isZh ? '项未通过' : 'Failed'}</Tag>}
                  </Space>,
                  children: <div style={{ padding: '16px 0' }}>{renderScoringRules(probe)}</div>,
                },
                {
                  key: 'detail',
                  label: <Space>
                    <FileTextOutlined style={{ color: '#3b82f6' }} />
                    <Text strong style={{ color: '#f0f6ff' }}>{isZh ? '详细信息' : 'Details'}</Text>
                    {totalFindings > 0 && <Tag color="blue">{totalFindings}</Tag>}
                  </Space>,
                  children: <div style={{ padding: '16px 0' }}>{renderFindings(probe)}</div>,
                },
                ...(hasRemediation ? [{
                  key: 'remediation',
                  label: <Space>
                    <ToolOutlined style={{ color: '#faad14' }} />
                    <Text strong style={{ color: '#f0f6ff' }}>{isZh ? '修复建议' : 'Remediation'}</Text>
                  </Space>,
                  children: <div style={{ padding: '16px 0' }}>{renderRemediation(probe)}</div>,
                }] : []),
              ]}
            />
          </div>
        ) : (
          <>
            {probe.scoring_rules && probe.scoring_rules.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 13, color: '#3b82f6' }}>
                  {isZh ? '评分规则明细' : 'Scoring Rules'}
                </Text>
                {renderScoringRules(probe)}
              </div>
            )}
            {renderFindings(probe)}
            {renderRemediation(probe)}
          </>
        )}
      </Card>
    );
  };

  const renderRepoItem = (repo: RepoConfig) => {
    const isSelected = repo.id === selectedRepoId;
    return (
      <div
        key={repo.id}
        onClick={() => setSelectedRepoId(repo.id)}
        style={{
          padding: '10px 14px',
          cursor: 'pointer',
          background: isSelected ? 'rgba(59,130,246,0.1)' : 'transparent',
          borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(59,130,246,0.05)'; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong style={{ fontSize: 13, color: isSelected ? '#3b82f6' : '#f0f6ff' }}>{repo.name}</Text>
          {repo.lastChecked ? (
            <Tag color="success" style={{ fontSize: 11 }}>✓</Tag>
          ) : (
            <Tag style={{ fontSize: 11 }}>{t.repos.never}</Tag>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#b0c8e8', marginTop: 2 }}>
          <Tag color="blue" style={{ fontSize: 10, padding: '0 4px' }}>{repo.branch}</Tag>
          {repo.lastChecked && <span>{new Date(repo.lastChecked).toLocaleDateString()}</span>}
        </div>
      </div>
    );
  };

  if (loading && !currentResult) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const allGroupKeys = grouped.map((_, i) => String(i));

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 'calc(100vh - 120px)' }}>
      <div style={{ width: 280, flexShrink: 0 }}>
        <Card className="card" style={{ height: '100%', overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0, color: '#f0f6ff' }}>{t.repos.title}</Title>
            <Button size="small" type="primary" onClick={runCheck} loading={checking} disabled={!selectedRepoId}>
              {t.checks.runCheck}
            </Button>
          </div>
          <Collapse
            activeKey={sidebarGroupKeys.length > 0 ? sidebarGroupKeys : allGroupKeys}
            onChange={(keys) => setSidebarGroupKeys(keys as string[])}
            ghost
            items={grouped.map((group, i) => ({
              key: String(i),
              label: (
                <Space>
                  <Tag color={platformColor[group.platform] || 'default'} style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>{group.platform}</Tag>
                  <Text strong style={{ fontSize: 13, color: '#f0f6ff' }}>{group.owner}</Text>
                  <Badge count={group.repos.length} style={{ backgroundColor: '#3b82f6' }} />
                </Space>
              ),
              children: group.repos.map(renderRepoItem),
            }))}
          />
        </Card>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
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
                        <div className="stat-value" style={{ color: '#52c41a' }}><CheckCircleOutlined /> {currentResult.summary.pass}</div>
                        <div className="stat-label">{t.checks.passed}</div>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div className="stat-card">
                        <div className="stat-value" style={{ color: '#ff4d4f' }}><CloseCircleOutlined /> {currentResult.summary.fail}</div>
                        <div className="stat-label">{t.checks.failed}</div>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div className="stat-card">
                        <div className="stat-value" style={{ color: '#faad14' }}><WarningOutlined /> {currentResult.summary.warning}</div>
                        <div className="stat-label">{t.checks.warnings}</div>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div className="stat-card">
                        <div className="stat-value" style={{ color: '#8c8c8c' }}><MinusCircleOutlined /> {currentResult.summary.notApplicable}</div>
                        <div className="stat-label">{t.checks.notApplicable}</div>
                      </div>
                    </Col>
                  </Row>
                  <Row gutter={16} style={{ marginTop: 16 }}>
                    <Col span={6}><Tag color="#cf1322" style={{ padding: '8px 16px', fontSize: 14 }}>Critical: {currentResult.summary.criticalRisk}</Tag></Col>
                    <Col span={6}><Tag color="red" style={{ padding: '8px 16px', fontSize: 14 }}><BugOutlined /> {t.checks.highRisk}: {currentResult.summary.highRisk}</Tag></Col>
                    <Col span={6}><Tag color="orange" style={{ padding: '8px 16px', fontSize: 14 }}><WarningOutlined /> {t.checks.mediumRisk}: {currentResult.summary.mediumRisk}</Tag></Col>
                    <Col span={6}><Tag color="blue" style={{ padding: '8px 16px', fontSize: 14 }}><InfoCircleOutlined /> {t.checks.lowRisk}: {currentResult.summary.lowRisk}</Tag></Col>
                  </Row>
                  <div style={{ marginTop: 12, fontSize: 12, color: '#b0c8e8' }}>
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
                    <Button key={i} size="small" type={currentResult.checkedAt === r.checkedAt ? 'primary' : 'default'} onClick={() => setCurrentResult(r)}>
                      {new Date(r.checkedAt).toLocaleString()} ({r.normalizedScore})
                    </Button>
                  ))}
                </Space>
              </Card>
            )}

            <Collapse
              activeKey={expandedKeys}
              onChange={(keys) => setExpandedKeys(keys as string[])}
              items={[
                {
                  key: '__failed',
                  label: <Text strong style={{ color: '#ff4d4f' }}><CloseCircleOutlined /> {t.checks.failedChecks} ({currentResult.probes.filter(p => p.outcome === 'fail').length})</Text>,
                  children: renderProbeSection(currentResult.probes.filter(p => p.outcome === 'fail'))
                },
                {
                  key: '__warning',
                  label: <Text strong style={{ color: '#faad14' }}><WarningOutlined /> {t.checks.warningChecks} ({currentResult.probes.filter(p => p.outcome === 'warning').length})</Text>,
                  children: renderProbeSection(currentResult.probes.filter(p => p.outcome === 'warning'))
                },
                {
                  key: '__passed',
                  label: <Text strong style={{ color: '#52c41a' }}><CheckCircleOutlined /> {t.checks.passedChecks} ({currentResult.probes.filter(p => p.outcome === 'pass').length})</Text>,
                  children: renderProbeSection(currentResult.probes.filter(p => p.outcome === 'pass'))
                }
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default CheckResults;
