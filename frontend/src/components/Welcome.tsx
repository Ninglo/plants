import { useState } from 'react';
import type { ClassInfo, DayOfWeek } from '../types';
import { getCurrentWeek, getWeekRange, formatDateShort } from '../utils/weekNumber';
import { getSchedule, saveSchedule, sortClassesBySchedule, ALL_DAYS } from '../utils/classSchedule';
import './Welcome.css';

interface Props {
  teacherName: string;
  classes: ClassInfo[];
  onSelectClass: (cls: ClassInfo) => void;
}

export default function Welcome({ teacherName, classes, onSelectClass }: Props) {
  const week = getCurrentWeek();
  const { start, end } = getWeekRange(week);
  const [showGuide, setShowGuide] = useState(false);
  const [openSchedule, setOpenSchedule] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  const firstName = teacherName.replace(/^(ms\.?|mr\.?|mrs\.?)/i, '').trim().split(/[\s_]/)[0];
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  function handleManualStart() {
    onSelectClass({ id: 'manual', name: '手动输入' });
  }

  function toggleDay(classCode: string, day: DayOfWeek) {
    const current = getSchedule(classCode);
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    saveSchedule(classCode, next);
    forceUpdate((n) => n + 1);
  }

  const sortedClasses = sortClassesBySchedule(classes);

  return (
    <div className="welcome-wrap fade-in">
      <header className="welcome-header">
        <div className="welcome-greeting">
          <div className="greeting-text">
            <h1>Welcome, {displayName}</h1>
            <p className="slogan">Super Amber is here! · I will help you</p>
          </div>
        </div>
        <div className="week-badge">
          <span className="week-num">Week {week}</span>
          <span className="week-range">{formatDateShort(start)} – {formatDateShort(end)}</span>
        </div>
      </header>

      <div className="welcome-body">
        {classes.length > 0 ? (
          <>
            <div className="section-title">
              <span>你的班级</span>
              <span className="section-count">{classes.length} 个班级</span>
            </div>
            <div className="class-grid">
              {sortedClasses.map((cls) => {
                const days = getSchedule(cls.name);
                const isOpen = openSchedule === cls.name;
                return (
                  <div key={cls.id} className="class-card-wrap">
                    <button
                      className="class-card"
                      onClick={() => onSelectClass(cls)}
                    >
                      <div className="class-code">{cls.name}</div>
                      <div className="class-action">进入 →</div>
                    </button>
                    <button
                      className={`class-schedule-badge${days.length ? ' has-days' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenSchedule(isOpen ? null : cls.name);
                      }}
                    >
                      {days.length
                        ? `📅 ${days.join(' · ')}`
                        : '＋ 设置上课时间'}
                    </button>
                    {isOpen && (
                      <div className="class-day-picker" onClick={(e) => e.stopPropagation()}>
                        {ALL_DAYS.map((day) => (
                          <button
                            key={day}
                            className={`day-btn${days.includes(day) ? ' selected' : ''}`}
                            onClick={() => toggleDay(cls.name, day)}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty-classes card">
            <div className="empty-icon">📂</div>
            <div className="empty-text">
              <strong>未绑定教务系统</strong>
              <p>班级号将在上传文件时自动从文件名中读取</p>
            </div>
            <button className="btn btn-primary" onClick={handleManualStart}>
              直接开始 →
            </button>
          </div>
        )}

        <div className="welcome-hint card">
          <div className="hint-icon">💡</div>
          <div className="hint-text">
            <strong>操作流程</strong>
            <p>选择班级 → 选择功能 → 上传数据文件 → 确认明细 → 生成图片 & Excel</p>
          </div>
        </div>

        <div className="guide-panel card">
          <button className="guide-toggle" onClick={() => setShowGuide((v) => !v)}>
            <span className="guide-toggle-icon">📖</span>
            <span>使用说明</span>
            <span className="guide-toggle-arrow">{showGuide ? '▲' : '▼'}</span>
          </button>
          {showGuide && (
            <iframe
              src="/guide.html"
              className="guide-frame"
              title="使用说明"
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </div>
    </div>
  );
}
