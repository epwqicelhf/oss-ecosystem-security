import React, { useEffect, useState } from 'react';
import { Card, Typography, Tag, Space, Table, Badge, Divider, Tabs, Spin } from 'antd';
import { SafetyCertificateOutlined, ApiOutlined, CodeOutlined, CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { rulesApi } from '../api';
import type { RuleCategory, RuleScoringItem, SeverityWeights } from '../api';
import { useLanguageStore } from '../stores/language';

const { Title, Text, Paragraph } = Typography;

const severityColor: Record<string, string> = { critical: '#cf1322', high: '#ff4d4f', medium: '#faad14', low: '#3b82f6' };

const Rules: React.FC = () => {
  const [rules, setRules] = useState<RuleCategory[]>([]);
  const [weights, setWeights] = useState<SeverityWeights | null>(null);
  const [loading, setLoading] = useState(true);
  const { current: lang } = useLanguageStore();
  const isZh = lang === 'zh-CN';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesData, weightsData] = await Promise.all([rulesApi.getAll(), rulesApi.getSeverityWeights()]);
      setRules(rulesData);
      setWeights(weightsData);
    } catch { }
    finally { setLoading(false); }
  };

  const renderScoringItem = (item: RuleScoringItem) => (
    <div key={item.name} style={{
      padding: '14px 18px', marginBottom: 10, borderRadius: 8,
      background: item.is_deduction ? 'rgba(255,77,79,0.04)' : 'rgba(59,130,246,0.04)',
      border: `1px solid ${item.is_deduction ? 'rgba(255,77,79,0.2)' : 'rgba(59,130,246,0.2)'}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space>
          {item.is_deduction ?
            <Badge status="error" /> :
            <Badge status="processing" />
          }
          <Text strong style={{ fontSize: 14 }}>{isZh ? item.name_zh : item.name}</Text>
          <Tag color={item.is_deduction ? 'red' : 'blue'}>
            {item.is_deduction ? (isZh ? '扣分项' : 'Deduction') : (isZh ? '参考项' : 'Reference')}
          </Tag>
          {item.max_points > 0 && <Tag>{item.max_points} {isZh ? '分' : 'pts'}</Tag>}
        </Space>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.8 }}>
        <div>
          <Text type="secondary"><CodeOutlined /> {isZh ? '检查方法: ' : 'Check Method: '}</Text>
          <Text>{isZh ? item.check_method_zh : item.check_method}</Text>
        </div>

        {item.pass_condition && (
          <div>
            <Text type="secondary"><CheckCircleOutlined /> {isZh ? '通过条件: ' : 'Pass Condition: '}</Text>
            <Text>{isZh ? item.pass_condition_zh : item.pass_condition}</Text>
          </div>
        )}

        {item.reasoning && (
          <div>
            <Text type="secondary"><InfoCircleOutlined /> {isZh ? '判断依据: ' : 'Reasoning: '}</Text>
            <Text>{isZh ? item.reasoning_zh : item.reasoning}</Text>
          </div>
        )}

        {item.api_sources && item.api_sources.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <Text type="secondary"><ApiOutlined /> {isZh ? 'API 数据来源:' : 'API Sources:'}</Text>
            <Table
              size="small"
              dataSource={item.api_sources}
              rowKey={(r) => r.platform + r.endpoint}
              pagination={false}
              style={{ marginTop: 4 }}
              columns={[
                { title: isZh ? '平台' : 'Platform', dataIndex: 'platform', key: 'platform', width: 100, render: (v: string) => <Tag>{v}</Tag> },
                { title: isZh ? '接口' : 'Endpoint', dataIndex: 'endpoint', key: 'endpoint', render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
                { title: isZh ? '说明' : 'Description', key: 'desc', render: (_: unknown, r: any) => <Text style={{ fontSize: 12 }}>{isZh ? r.description_zh : r.description}</Text> },
              ]}
            />
          </div>
        )}

        {item.detection_fields && item.detection_fields.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <Text type="secondary">{isZh ? '检测字段:' : 'Detection Fields:'}</Text>
            <div style={{ marginTop: 4 }}>
              {item.detection_fields.map((f, i) => (
                <Tag key={i} style={{ marginBottom: 4 }}>
                  <Text code style={{ fontSize: 11 }}>{f.field}</Text>
                  {' - '}{isZh ? f.description_zh : f.description}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {item.reference_format && !item.is_deduction && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', color: '#3b82f6', fontSize: 13 }}>
              {isZh ? '查看参考格式' : 'View Reference Format'}
            </summary>
            <pre style={{
              fontSize: 12, padding: 10, marginTop: 6, borderRadius: 6,
              background: 'rgba(0,0,0,0.3)', color: '#f0f6ff',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}>
              {isZh && item.reference_format_zh ? item.reference_format_zh : item.reference_format}
            </pre>
          </details>
        )}
      </div>
    </div>
  );

  const renderCategory = (cat: RuleCategory) => {
    const deductionItems = cat.scoring_items.filter(i => i.is_deduction);
    const referenceItems = cat.scoring_items.filter(i => !i.is_deduction);

    return (
      <Card
        key={cat.id}
        className="card"
        style={{ marginBottom: 16, borderLeft: `4px solid ${severityColor[cat.severity] || '#8c8c8c'}` }}
        title={
          <Space>
            <SafetyCertificateOutlined />
            <Text strong style={{ fontSize: 16 }}>{isZh ? cat.name_zh : cat.name}</Text>
            <Tag color={severityColor[cat.severity]} style={{ fontWeight: 700 }}>{cat.severity.toUpperCase()}</Tag>
            <Tag>w: {cat.weight}</Tag>
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {isZh ? cat.description_zh : cat.description}
        </Paragraph>

        {deductionItems.length > 0 && (
          <>
            <Text strong style={{ fontSize: 14, color: '#ff4d4f' }}>
              <CloseCircleOutlined /> {isZh ? '扣分项' : 'Deduction Items'} ({deductionItems.length})
            </Text>
            <div style={{ marginTop: 8 }}>
              {deductionItems.map(renderScoringItem)}
            </div>
          </>
        )}

        {referenceItems.length > 0 && (
          <>
            <Divider />
            <Text strong style={{ fontSize: 14, color: '#3b82f6' }}>
              <InfoCircleOutlined /> {isZh ? '参考项（不扣分）' : 'Reference Items (No Deduction)'} ({referenceItems.length})
            </Text>
            <div style={{ marginTop: 8 }}>
              {referenceItems.map(renderScoringItem)}
            </div>
          </>
        )}
      </Card>
    );
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const groupedBySeverity = {
    critical: rules.filter(r => r.severity === 'critical'),
    high: rules.filter(r => r.severity === 'high'),
    medium: rules.filter(r => r.severity === 'medium'),
    low: rules.filter(r => r.severity === 'low'),
  };

  return (
    <div>
      <Title level={3} style={{ margin: 0, marginBottom: 24, color: '#f0f6ff' }}>
        <SafetyCertificateOutlined /> {isZh ? '检查规则与评分标准' : 'Check Rules & Scoring Standards'}
      </Title>

      {weights && (
        <Card className="card" style={{ marginBottom: 24 }}>
          <Title level={4} style={{ color: '#f0f6ff', marginTop: 0 }}>
            {isZh ? '评分公式' : 'Scoring Formula'}
          </Title>
          <div style={{ fontSize: 16, padding: '12px 20px', background: 'rgba(59,130,246,0.08)', borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ color: '#3b82f6', fontSize: 18 }}>
              {isZh ? weights.formula.zh : weights.formula.en}
            </Text>
          </div>
          <Table
            size="small"
            dataSource={[
              { severity: 'Critical', severity_zh: '严重', weight: 10, count: groupedBySeverity.critical.length, color: severityColor.critical },
              { severity: 'High', severity_zh: '高', weight: 7.5, count: groupedBySeverity.high.length, color: severityColor.high },
              { severity: 'Medium', severity_zh: '中', weight: 5, count: groupedBySeverity.medium.length, color: severityColor.medium },
              { severity: 'Low', severity_zh: '低', weight: 2.5, count: groupedBySeverity.low.length, color: severityColor.low },
            ]}
            rowKey="severity"
            pagination={false}
            columns={[
              { title: isZh ? '严重级别' : 'Severity', key: 'severity', render: (_: unknown, r: any) => <Tag color={r.color} style={{ fontWeight: 700 }}>{isZh ? r.severity_zh : r.severity}</Tag> },
              { title: isZh ? '权重' : 'Weight', dataIndex: 'weight', key: 'weight', render: (v: number) => <Text strong>{v}</Text> },
              { title: isZh ? '检查项数' : 'Checks', dataIndex: 'count', key: 'count' },
            ]}
          />
        </Card>
      )}

      <Tabs
        items={[
          { key: 'critical', label: <span style={{ color: severityColor.critical, fontWeight: 700 }}>Critical ({groupedBySeverity.critical.length})</span>, children: groupedBySeverity.critical.map(renderCategory) },
          { key: 'high', label: <span style={{ color: severityColor.high, fontWeight: 700 }}>High ({groupedBySeverity.high.length})</span>, children: groupedBySeverity.high.map(renderCategory) },
          { key: 'medium', label: <span style={{ color: severityColor.medium, fontWeight: 700 }}>Medium ({groupedBySeverity.medium.length})</span>, children: groupedBySeverity.medium.map(renderCategory) },
          { key: 'low', label: <span style={{ color: severityColor.low, fontWeight: 700 }}>Low ({groupedBySeverity.low.length})</span>, children: groupedBySeverity.low.map(renderCategory) },
        ]}
      />
    </div>
  );
};

export default Rules;
