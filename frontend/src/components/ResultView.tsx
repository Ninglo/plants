import { useRef, useState } from 'react';
import type { MPBreakdown, StudentData, BonusItem } from '../types';
import { generateOutputExcel } from '../utils/parseExcel';
import './ResultView.css';

interface Props {
  results: MPBreakdown[];
  students: StudentData[];
  bonusItems: BonusItem[];
  classCode: string;
  week: number;
  onBack: () => void;
}

type SortKey = 'total_desc' | 'total_asc' | 'en_asc' | 'en_desc' | 'zh_asc' | 'zh_desc';

function fmt(mp: number): string {
  if (mp <= 0) return '—';
  if (mp >= 1) return `${parseFloat(mp.toFixed(1))} MP`;
  return `${Math.round(mp * 10)} CP`;
}

function sortResults(list: MPBreakdown[], key: SortKey): MPBreakdown[] {
  const r = [...list];
  switch (key) {
    case 'total_desc': return r.sort((a, b) => b.total - a.total);
    case 'total_asc':  return r.sort((a, b) => a.total - b.total);
    case 'en_asc':  return r.sort((a, b) => a.englishName.localeCompare(b.englishName));
    case 'en_desc': return r.sort((a, b) => b.englishName.localeCompare(a.englishName));
    case 'zh_asc':  return r.sort((a, b) => a.chineseName.localeCompare(b.chineseName, 'zh'));
    case 'zh_desc': return r.sort((a, b) => b.chineseName.localeCompare(a.chineseName, 'zh'));
  }
}

const RULES_TEXT = `MP 发放原则

本次 MP 由以下几个部分构成：

【基础落实】（必选）
· 方案一（逐项累计）：每完成一个任务 +0.1 MP；成为词王 +0.2 MP；词王准确率 ≥75% 再 +0.2 MP；AI语音平均分 ≥75% +0.2 MP；测试得分率 ≥75% +0.2 MP
· 方案二（全勤奖励）：所有任务全部完成方可获得 0.5 MP 基础分，词王 / AI语音 / 测试得分率奖励在基础分之上叠加
本次基础落实数据包含：音频、主题表达积累（含词王）、小挑战、AI语音、测试、复合资源

【每日开口】（可选）
打卡天数 × 每次打卡 MP 值，按实际打卡情况发放

【课堂参与】（可选）
全班默认值 + PK 获胜者额外奖励，由老师手动调整

【个性化奖励】（可选）
老师自定义奖励任务，指定学生与金额，灵活叠加`;

export default function ResultView({ results, students, bonusItems, classCode, week, onBack }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('total_desc');
  const [showRules, setShowRules] = useState(false);

  const mpMap = new Map(results.map((r) => [r.studentId, r.total]));

  const showBasic = results.some((r) => r.基础落实 > 0);
  const showDaily = results.some((r) => r.每日开口 > 0);
  const showClass = results.some((r) => r.课堂参与 > 0);

  const bonusCols = bonusItems.filter((b) =>
    results.some((r) => b.studentIds.includes(r.studentId) && b.amount > 0)
  );

  function getBonusAmount(studentId: string, bonus: BonusItem): number {
    return bonus.studentIds.includes(studentId) ? bonus.amount : 0;
  }

  const sorted = sortResults(results, sortKey);
  const totalMP = results.reduce((s, r) => s + r.total, 0);

  async function handleDownloadImage() {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#f7faf2',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `${classCode}_Week${week}_MP发放公示.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  }

  function handleDownloadExcel() {
    const buf = generateOutputExcel(students, mpMap);
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${classCode}_Week${week}_MP发放.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'total_desc', label: '总量 ↓' },
    { key: 'total_asc',  label: '总量 ↑' },
    { key: 'en_asc',  label: '英文名 A→Z' },
    { key: 'en_desc', label: '英文名 Z→A' },
    { key: 'zh_asc',  label: '中文名 升序' },
    { key: 'zh_desc', label: '中文名 降序' },
  ];

  return (
    <div className="result-wrap fade-in">
      <div className="result-topbar">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <div className="result-controls">
          <button
            className={`btn btn-ghost btn-sm${showRules ? ' btn-rules-active' : ''}`}
            onClick={() => setShowRules((v) => !v)}
          >
            {showRules ? '隐藏发放规则' : '显示发放规则'}
          </button>
          <select className="sort-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={handleDownloadExcel}>↓ Excel</button>
          <button className="btn btn-primary btn-sm" onClick={handleDownloadImage} disabled={exporting}>
            {exporting ? '生成中...' : '↓ 图片'}
          </button>
        </div>
      </div>

      <div className="result-card card" ref={cardRef}>
        <div className="result-header">
          <div className="result-class-info">
            <span className="result-class-code">{classCode}</span>
            <span className="result-week-badge">Week {week}</span>
            <span className="result-meta">{results.length} 人 · 合计 {fmt(totalMP)}</span>
          </div>
        </div>

        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th className="col-rank-h">#</th>
                <th>英文名</th>
                <th>中文名</th>
                {showBasic && <th>基础落实</th>}
                {showDaily && <th>每日开口</th>}
                {showClass && <th>课堂参与</th>}
                {bonusCols.map((b) => <th key={b.name}>{b.name}</th>)}
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.studentId} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                  <td className="col-rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}
                  </td>
                  <td className="col-name-en">{r.englishName}</td>
                  <td className="col-name-zh">{r.chineseName}</td>
                  {showBasic && <td>{fmt(r.基础落实)}</td>}
                  {showDaily && <td>{fmt(r.每日开口)}</td>}
                  {showClass && <td>{fmt(r.课堂参与)}</td>}
                  {bonusCols.map((b) => (
                    <td key={b.name}>{fmt(getBonusAmount(r.studentId, b))}</td>
                  ))}
                  <td className="col-total-val">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showRules && (
          <div className="result-rules">
            <pre>{RULES_TEXT}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
