import type { ClassInfo, ClassSchedule, DayOfWeek } from '../types';

const STORAGE_KEY = 'amber_class_schedules';

const DAY_ORDER: Record<DayOfWeek, number> = {
  '周一': 1, '周二': 2, '周三': 3, '周四': 4,
  '周五': 5, '周六': 6, '周日': 7,
};

export const ALL_DAYS: DayOfWeek[] = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function loadAllSchedules(): ClassSchedule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ClassSchedule[];
  } catch {
    return [];
  }
}

export function saveSchedule(classCode: string, days: DayOfWeek[]): void {
  const list = loadAllSchedules().filter((s) => s.classCode !== classCode);
  list.push({ classCode, days });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getSchedule(classCode: string): DayOfWeek[] {
  return loadAllSchedules().find((s) => s.classCode === classCode)?.days ?? [];
}

export function sortClassesBySchedule(classes: ClassInfo[]): ClassInfo[] {
  return [...classes].sort((a, b) => {
    const daysA = getSchedule(a.name);
    const daysB = getSchedule(b.name);
    const minA = daysA.length ? Math.min(...daysA.map((d) => DAY_ORDER[d])) : 8;
    const minB = daysB.length ? Math.min(...daysB.map((d) => DAY_ORDER[d])) : 8;
    if (minA !== minB) return minA - minB;
    return a.name.localeCompare(b.name);
  });
}
