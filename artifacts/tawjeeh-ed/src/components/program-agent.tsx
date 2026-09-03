import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardPenLine,
  Clock3,
  FilePlus2,
  Plus,
  Search,
  Sparkles,
  Target,
  Timer,
  X,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { PlannerIntakeCard, type PlannerIntakeValues } from '@/components/phase-one';
import {
  getGetExamModeQueryKey,
  getGetLearningScheduleQueryKey,
  useGetExamMode,
  useGetLearningSchedule,
  useUpdateLearningSchedule,
  type ExamMode,
  type ScheduleEntry,
} from '@workspace/api-client-react';
import owlAgentTeal from '@assets/agent-guiding-cropped.png';
import owlAgentThinking from '@assets/agent-thinking-cropped.png';
import owlAgentSuccess from '@assets/agent-success-cropped.png';

type ProgramKind = 'مكتسبات' | 'حصة تطبيقية' | 'مراجعة' | 'اختبار' | 'فرض' | 'بحث';
type SessionTrack = 'theory' | 'application';

type ProgramEntry = {
  id: string;
  date: string;
  time: string;
  duration?: string;
  title: string;
  subject: string;
  kind: ProgramKind;
  agent: 'فهيم' | 'دليل' | 'تمارين';
  completed: boolean;
  slot?: 1 | 2 | 3;
  track?: SessionTrack;
  endRule?: string;
  serverId?: number;
  remediationLabel?: string | null;
  missed?: boolean;
  volumeMultiplier?: number;
  penaltyType?: string | null;
};

type ProgramAgentProps = {
  embedded?: boolean;
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

const today = localDate();
const examDateKey = 'tawjeeh.exam.baccalaureate-date';
const defaultExamDate = `${new Date().getFullYear() + 1}-06-07`;
const subjectOptions = ['الرياضيات', 'الفيزياء'];

function normalizeProgramSubject(subject?: string) {
  return subject === 'الرياضيات' ? 'الرياضيات' : 'الفيزياء';
}

type FoundationalModule = {
  nodeId: string;
  title: string;
  summary: string;
  source: string;
  page: number;
};

function createGroundedSlots(modules: FoundationalModule[]): Omit<ProgramEntry, 'id' | 'date' | 'completed'>[] {
  if (modules.length < 3) return [];
  const tracks = [
    { time: '08:30', duration: '25–40 دقيقة', kind: 'مكتسبات' as const, agent: 'فهيم' as const, slot: 1 as const, track: 'theory' as const, endRule: 'تنتهي عندما تشرح الفكرة بكلماتك' },
    { time: '12:00', duration: 'حتى حل تمرينين', kind: 'حصة تطبيقية' as const, agent: 'تمارين' as const, slot: 2 as const, track: 'application' as const, endRule: 'تتوقف عند أول إجابة تحتاج تصحيحًا' },
    { time: '17:30', duration: 'حتى إجابة التحقق', kind: 'مراجعة' as const, agent: 'دليل' as const, slot: 3 as const, track: 'application' as const, endRule: 'تنتهي بعد إجابة قصيرة تثبت التقدم' },
  ];
  return tracks.map((track, index) => ({
    ...track,
    title: modules[index].title,
    subject: 'الفيزياء',
  }));
}

const kindStyles: Record<ProgramKind, { tone: string; icon: typeof BookOpenCheck }> = {
  مكتسبات: { tone: 'program-tone-sky', icon: BookOpenCheck },
  'حصة تطبيقية': { tone: 'program-tone-teal', icon: Target },
  مراجعة: { tone: 'program-tone-violet', icon: Search },
  اختبار: { tone: 'program-tone-amber', icon: ClipboardPenLine },
  فرض: { tone: 'program-tone-rose', icon: ClipboardPenLine },
  بحث: { tone: 'program-tone-blue', icon: FilePlus2 },
};

function readEntries(groundedSlots: Omit<ProgramEntry, 'id' | 'date' | 'completed'>[]): ProgramEntry[] {
  try {
    const saved = localStorage.getItem('tawjeeh.program.entries');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    const legacyToday = parsed.filter((entry): entry is ProgramEntry => entry?.date === today && !entry?.slot).slice(0, 3);
    const savedSessions = parsed.filter((entry): entry is ProgramEntry => entry?.slot && entry?.date);
    const todaySessions = groundedSlots.map((slot, index) => ({
      ...slot,
      id: `program-${index + 1}`,
      date: today,
      completed: savedSessions.find((entry) => entry.date === today && entry.slot === slot.slot)?.completed
        ?? legacyToday[index]?.completed
        ?? false,
      title: savedSessions.find((entry) => entry.date === today && entry.slot === slot.slot)?.title
        ?? legacyToday[index]?.title
        ?? slot.title,
      subject: normalizeProgramSubject(savedSessions.find((entry) => entry.date === today && entry.slot === slot.slot)?.subject
        ?? legacyToday[index]?.subject
        ?? slot.subject),
    }));
    const nonSessionEntries = parsed.filter((entry): entry is ProgramEntry => entry?.date && !entry?.slot);
    return [...todaySessions, ...nonSessionEntries];
  } catch {
    return [];
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ar-DZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
}

function entryStartTime(entry: ProgramEntry) {
  return new Date(`${entry.date}T${entry.time}:00`).getTime();
}

function createDailySessions(date: string, groundedSlots: Omit<ProgramEntry, 'id' | 'date' | 'completed'>[], seed?: ProgramEntry): ProgramEntry[] {
  return groundedSlots.map((slot, index) => ({
    ...slot,
    id: `smart-${date}-${index + 1}`,
    date,
    subject: seed?.subject ?? slot.subject,
    completed: false,
  }));
}

function toProgramEntry(entry: ScheduleEntry): ProgramEntry {
  const isTheory = !entry.remediation_label && (entry.kind.includes('نظر') || entry.kind.includes('مكتسب') || entry.kind.includes('فهم'));
  const isPractical = !entry.remediation_label && (entry.kind.includes('تطبيق') || entry.kind.includes('تمرين'));
  return {
    id: `remediation-${entry.id}`,
    serverId: entry.id,
    date: entry.scheduled_date,
    time: entry.time,
    duration: entry.duration,
    title: entry.title,
    subject: normalizeProgramSubject(entry.subject),
    kind: isTheory ? 'مكتسبات' : isPractical ? 'حصة تطبيقية' : 'مراجعة',
    agent: isTheory ? 'فهيم' : isPractical ? 'تمارين' : 'دليل',
    completed: entry.completed,
    remediationLabel: entry.remediation_label,
    missed: entry.missed,
    volumeMultiplier: entry.volume_multiplier,
    penaltyType: entry.penalty_type,
    track: isTheory ? 'theory' : 'application',
    endRule: isTheory ? 'تنتهي عندما تشرح الفكرة بكلماتك' : 'تستمر حتى تثبيت المفهوم المرتبط بالخطأ',
  };
}

const agentProfiles = {
  فهيم: { image: owlAgentTeal, role: 'يفتح الفكرة', tone: 'fahim' },
  دليل: { image: owlAgentThinking, role: 'يثبت الفهم', tone: 'dalil' },
  تمارين: { image: owlAgentSuccess, role: 'يحوّلها إلى تطبيق', tone: 'exercises' },
} as const;

function ProgramMiniAgent({ agent }: { agent: ProgramEntry['agent'] }) {
  const profile = agentProfiles[agent];
  return (
    <span className={`program-mini-avatar ${profile.tone}`} title={`${agent} · ${profile.role}`}>
      <img src={profile.image} alt={agent} />
    </span>
  );
}

function ProgramAgentAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'program-avatar-lg' : size === 'sm' ? 'program-avatar-sm' : 'program-avatar-md';
  return (
    <span className={`program-agent-avatar ${dimensions}`}>
      <img src={owlAgentTeal} alt="مساعد ترتيب البرنامج" />
      <i />
    </span>
  );
}

function ProgramEntryCard({
  entry,
  onToggle,
  onStart,
}: {
  entry: ProgramEntry;
  onToggle: () => void;
  onStart: () => void;
}) {
  const { tone, icon: Icon } = kindStyles[entry.kind];
  return (
    <article className={`program-entry-card ${entry.completed ? 'is-complete' : ''}`} data-testid={`card-program-entry-${entry.id}`}>
      <div className="program-entry-time">
        <span>تبدأ · يحددها البرنامج</span>
        <strong>{entry.time}</strong>
        <small><Timer size={12} /> {entry.duration ?? 'المدة من اختيارك'}</small>
      </div>
      <div className={`program-entry-icon ${tone}`}><Icon size={19} /></div>
      <div className="program-entry-content">
        <div className="program-entry-meta">
          <span className={`program-kind ${tone}`}>{entry.remediationLabel ?? (entry.slot ? `الحصة ${entry.slot} من ٣` : entry.kind)}</span>
          <span>{entry.subject}</span>
        </div>
        <h3>{entry.title}</h3>
        <p>{entry.remediationLabel ? 'مراجعة مخصصة لموضع الخطأ · أضيفت تلقائيًا' : entry.track === 'theory' ? 'نظرية · فهيم يشرح ويستمع لإجابتك' : `${entry.agent} · ${entry.endRule ?? 'التقدم يحدد نهاية الحصة'}`}</p>
      </div>
      {entry.slot && <ProgramMiniAgent agent={entry.agent} />}
      <div className="program-entry-actions">
        <button
          type="button"
          className={`program-check-button ${entry.completed ? 'is-complete' : ''}`}
          onClick={onToggle}
          aria-label={entry.completed ? 'إلغاء إكمال الحصة' : 'تحديد الحصة كمكتملة'}
          data-testid={`button-complete-program-entry-${entry.id}`}
        >
          {entry.completed ? <Check size={15} /> : <span />}
        </button>
        {!entry.completed && (
          <button type="button" className="program-start-button" onClick={onStart} data-testid={`button-start-program-entry-${entry.id}`}>
            ابدأ الحصة
          </button>
        )}
      </div>
    </article>
  );
}

function ProgramPlanSession({
  entry,
  dayNumber,
  onUpdate,
  onToggle,
  onStart,
}: {
  entry: ProgramEntry;
  dayNumber: number;
  onUpdate: (updates: Partial<Pick<ProgramEntry, 'time' | 'subject'>>) => void;
  onToggle: () => void;
  onStart: () => void;
}) {
  const { tone, icon: Icon } = kindStyles[entry.kind];
  return (
    <article className="program-plan-session" data-testid={`card-plan-day-${dayNumber}-slot-${entry.slot}`}>
      <div className={`program-plan-session-icon ${tone}`}><Icon size={17} /></div>
      <div className="program-plan-session-copy">
        <span>الحصة {entry.slot} من ٣</span>
        <strong>{entry.title}</strong>
        <small>{entry.agent} · {entry.track === 'theory' ? 'فهم الفكرة' : 'تطبيق وتثبيت'}</small>
      </div>
      <label className="program-plan-control">
        <span>التوقيت</span>
        <input
          type="time"
          value={entry.time}
          onChange={(event) => onUpdate({ time: event.target.value })}
          aria-label={`توقيت اليوم ${dayNumber} الحصة ${entry.slot}`}
          data-testid={`input-plan-day-${dayNumber}-slot-${entry.slot}-time`}
        />
      </label>
      <label className="program-plan-control">
        <span>المادة</span>
        <select
          value={entry.subject}
          onChange={(event) => onUpdate({ subject: event.target.value })}
          aria-label={`مادة اليوم ${dayNumber} الحصة ${entry.slot}`}
          data-testid={`select-plan-day-${dayNumber}-slot-${entry.slot}-subject`}
        >
          {subjectOptions.map((subject) => <option key={subject}>{subject}</option>)}
        </select>
      </label>
      <button type="button" className="program-plan-start" onClick={onStart} data-testid={`button-plan-day-${dayNumber}-slot-${entry.slot}-start`}>
        ابدأ
      </button>
      {entry.serverId && (
        <button
          type="button"
          className={`program-plan-complete ${entry.completed ? 'is-complete' : ''}`}
          onClick={onToggle}
          aria-label={entry.completed ? 'إلغاء إكمال الحصة' : 'تحديد الحصة كمكتملة'}
          data-testid={`button-plan-day-${dayNumber}-slot-${entry.slot}-complete`}
        >
          {entry.completed ? <Check size={13} /> : <span />}
        </button>
      )}
    </article>
  );
}

export function ProgramAgent({ embedded = false }: ProgramAgentProps) {
  const [, setLocation] = useLocation();
  const [entries, setEntries] = useState<ProgramEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'notifications'>('overview');
  const [showAllPlanDays, setShowAllPlanDays] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPlannerIntake, setShowPlannerIntake] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'default' : Notification.permission,
  );
  const [examDate, setExamDate] = useState(() => localStorage.getItem(examDateKey) || defaultExamDate);
  const [entryDate, setEntryDate] = useState(() => localStorage.getItem('tawjeeh.phase1.entryDate') || today);
  const [newEntry, setNewEntry] = useState({
    date: today,
    time: '18:00',
    duration: '45 دقيقة',
    title: '',
    subject: 'الفيزياء',
    kind: 'اختبار' as ProgramKind,
  });
  const scheduleQuery = useGetLearningSchedule({
    query: {
      queryKey: getGetLearningScheduleQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const readinessQuery = useQuery<{ status: string; foundationalModules: FoundationalModule[] }>({
    queryKey: ['program-agent-readiness'],
    queryFn: async () => {
      const response = await fetch('/api/agents/readiness', { credentials: 'include' });
      const payload = await response.json() as { status?: string; foundationalModules?: FoundationalModule[]; message?: string };
      if (!response.ok) throw new Error(payload.message || 'تعذر تحميل وحدات المنهاج');
      return { status: payload.status ?? 'unavailable', foundationalModules: payload.foundationalModules ?? [] };
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const groundedSlots = useMemo(
    () => createGroundedSlots(readinessQuery.data?.foundationalModules ?? []),
    [readinessQuery.data?.foundationalModules],
  );
  const updateScheduleMutation = useUpdateLearningSchedule();
  const examModeQuery = useGetExamMode(
    { exam_date: examDate },
    {
      query: {
        queryKey: getGetExamModeQueryKey({ exam_date: examDate }),
        staleTime: 60_000,
      },
    },
  );
  const examMode = examModeQuery.data as ExamMode | undefined;
  const remediationEntries = useMemo(
    () => (scheduleQuery.data ?? []).map(toProgramEntry),
    [scheduleQuery.data],
  );
  const serverEntriesBySlot = useMemo(
    () => new Map(remediationEntries.map((entry) => [`${entry.date}-${entry.time}`, entry])),
    [remediationEntries],
  );
  const penaltyEntries = useMemo(
    () => remediationEntries.filter((entry) => entry.remediationLabel || entry.missed || (entry.volumeMultiplier ?? 1) > 1),
    [remediationEntries],
  );

  useEffect(() => {
    if (groundedSlots.length) setEntries((current) => current.length ? current : readEntries(groundedSlots));
    setNotificationsEnabled(localStorage.getItem('tawjeeh.program.notifications') !== 'off');
    const savedEntryDate = localStorage.getItem('tawjeeh.phase1.entryDate');
    if (savedEntryDate) setEntryDate(savedEntryDate);
  }, [groundedSlots]);

  useEffect(() => {
    if (!examMode || !notificationsEnabled || typeof Notification === 'undefined' || notificationPermission !== 'granted') return;
    const notificationKey = `tawjeeh.exam.notification.${examMode.mode}.${examMode.exam_date}.${examMode.error_concepts.length}`;
    if (localStorage.getItem(notificationKey)) return;
    const body = examMode.mode === 'error_stack'
      ? `بدأت مكدسات الأخطاء حول ${examMode.error_concepts.length} مفاهيم عالية الخطأ.`
      : examMode.mode === 'pre_exam'
        ? `بقي ${Math.max(0, examMode.days_until)} يومًا. أوراق المحاكاة المتنوعة جاهزة.`
        : '';
    if (!body) return;
    new Notification(examMode.label, { body, lang: 'ar' });
    localStorage.setItem(notificationKey, '1');
  }, [examMode, notificationPermission, notificationsEnabled]);

  useEffect(() => {
    if (!notificationsEnabled || typeof Notification === 'undefined' || notificationPermission !== 'granted') return;
    const notifyUpcomingEntries = () => {
      const now = Date.now();
      [...entries, ...remediationEntries].forEach((entry) => {
        if (entry.completed) return;
        const minutesUntilStart = Math.round((entryStartTime(entry) - now) / 60_000);
        if (minutesUntilStart < 0 || minutesUntilStart > 30) return;
        const notificationKey = `tawjeeh.program.notification.${entry.id}.${entry.date}.${entry.time}`;
        if (localStorage.getItem(notificationKey)) return;
        const timing = minutesUntilStart === 0 ? 'تبدأ الآن' : `تبدأ خلال ${minutesUntilStart} دقيقة`;
        new Notification(`اقتربت ${entry.kind}`, {
          body: `${entry.title} · ${timing}. افتح برنامجك وابدأ بخطوة واحدة.`,
          lang: 'ar',
        });
        localStorage.setItem(notificationKey, '1');
      });
    };
    notifyUpcomingEntries();
    const timer = window.setInterval(notifyUpcomingEntries, 60_000);
    return () => window.clearInterval(timer);
  }, [entries, notificationPermission, notificationsEnabled, remediationEntries]);

  useEffect(() => {
    localStorage.setItem('tawjeeh.program.entries', JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    if (!groundedSlots.length) return;
    setEntries((current) => {
      const tenDayDates = Array.from({ length: 10 }, (_, index) => addDays(entryDate, index));
      const planKeys = new Set(tenDayDates.flatMap((date) => [1, 2, 3].map((slot) => `${date}-${slot}`)));
      const savedSessions = new Map(
        current
          .filter((entry) => entry.slot && entry.date)
          .map((entry) => [`${entry.date}-${entry.slot}`, entry]),
      );
      const planSessions = tenDayDates.flatMap((date) =>
        createDailySessions(date, groundedSlots).map((session) => savedSessions.get(`${date}-${session.slot}`) ?? session),
      );
      const nonPlanEntries = current.filter((entry) => !entry.slot || !planKeys.has(`${entry.date}-${entry.slot}`));
      return [...planSessions, ...nonPlanEntries];
    });
  }, [entryDate, groundedSlots]);

  const tenDayPlan = useMemo(() => {
    if (groundedSlots.length < 3) return [];
    return Array.from({ length: 10 }, (_, dayIndex) => {
      const date = addDays(entryDate, dayIndex);
      return {
        date,
        dayNumber: dayIndex + 1,
        sessions: [1, 2, 3].map((slot) =>
          (() => {
            const fallbackEntry = createDailySessions(date, groundedSlots)[slot - 1];
            const localEntry = entries.find((entry) => entry.date === date && entry.slot === slot)
              ?? fallbackEntry;
            const typedSlot = slot as 1 | 2 | 3;
            const serverEntry = serverEntriesBySlot.get(`${date}-${localEntry.time}`);
            return serverEntry
              ? {
                ...serverEntry,
                ...localEntry,
                ...(localEntry.subject === fallbackEntry.subject ? { subject: serverEntry.subject } : {}),
                ...(localEntry.time === fallbackEntry.time ? { time: serverEntry.time } : {}),
                slot: typedSlot,
                id: localEntry.id,
                serverId: serverEntry.serverId,
              }
              : localEntry;
          })(),
        ),
      };
    });
  }, [entries, entryDate, groundedSlots, serverEntriesBySlot]);

  const extraEvents = useMemo(
    () => entries.filter((entry) => !entry.slot && ['اختبار', 'فرض', 'بحث'].includes(entry.kind)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [entries],
  );

  const toggleEntry = (entry: ProgramEntry) => {
    if (entry.serverId) {
      updateScheduleMutation.mutate({
        scheduleId: entry.serverId,
        data: { completed: !entry.completed },
      });
      return;
    }
    setEntries((current) => current.map((currentEntry) => currentEntry.id === entry.id ? { ...currentEntry, completed: !currentEntry.completed } : currentEntry));
  };

  const startEntry = (entry: ProgramEntry) => {
    sessionStorage.setItem('tawjeeh.program.lesson-access.v1', '1');
    if (entry.kind === 'مكتسبات' || entry.kind === 'حصة تطبيقية' || entry.kind === 'مراجعة') {
      setLocation(`/lesson/${entry.id}`);
    }
  };

  const updatePlanSession = (
    date: string,
    slot: 1 | 2 | 3,
    updates: Partial<Pick<ProgramEntry, 'time' | 'subject'>>,
  ) => {
    setEntries((current) => {
      const exists = current.some((entry) => entry.date === date && entry.slot === slot);
      if (exists) {
        return current.map((entry) => entry.date === date && entry.slot === slot ? { ...entry, ...updates } : entry);
      }
      const fallback = createDailySessions(date, groundedSlots)[slot - 1];
      return [...current, { ...fallback, ...updates }];
    });
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      localStorage.setItem('tawjeeh.program.notifications', 'on');
      setNotificationsEnabled(true);
    }
  };

  const toggleNotifications = () => {
    setNotificationsEnabled((enabled) => {
      const next = !enabled;
      localStorage.setItem('tawjeeh.program.notifications', next ? 'on' : 'off');
      if (next && notificationPermission === 'default') void requestNotificationPermission();
      return next;
    });
  };

  const plannerWindow = useMemo(() => {
    const start = new Date(`${entryDate}T12:00:00`);
    const current = new Date(`${today}T12:00:00`);
    const dayDifference = Math.floor((current.getTime() - start.getTime()) / 86_400_000);
    const day = Math.max(1, dayDifference + 1);
    return {
      day,
      inFoundation: dayDifference >= 0 && dayDifference < 10,
      progress: Math.min(100, Math.max(0, Math.round((day / 10) * 100))),
    };
  }, [entryDate]);
  const focusedPlanDay = Math.min(Math.max(plannerWindow.day, 1), tenDayPlan.length);
  const visiblePlan = showAllPlanDays
    ? tenDayPlan
    : tenDayPlan.filter(({ dayNumber }) => dayNumber === focusedPlanDay);

  const handlePlannerSubmit = (values: PlannerIntakeValues) => {
    const savedDate = localStorage.getItem('tawjeeh.phase1.entryDate') || today;
    localStorage.setItem('tawjeeh.phase1.planner.v1', JSON.stringify(values));
    localStorage.setItem('tawjeeh.phase1.entryDate', savedDate);
    setEntryDate(savedDate);
    setShowPlannerIntake(false);
    setActiveTab('overview');
  };

  const updateExamDate = (value: string) => {
    setExamDate(value || defaultExamDate);
    localStorage.setItem(examDateKey, value || defaultExamDate);
  };

  const addEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newEntry.title.trim()) return;
    const entry: ProgramEntry = {
      id: `program-${Date.now()}`,
      date: newEntry.date,
      time: newEntry.time,
      duration: newEntry.duration,
      title: newEntry.title.trim(),
      subject: newEntry.subject,
      kind: newEntry.kind,
      agent: newEntry.kind === 'بحث' ? 'دليل' : newEntry.kind === 'مكتسبات' ? 'فهيم' : 'تمارين',
      completed: false,
    };
    setEntries((current) => [...current, entry]);
    setShowAddForm(false);
    setActiveTab('events');
    setNewEntry((current) => ({ ...current, title: '' }));
  };

  return (
    <div className={`program-agent-page ${embedded ? 'is-embedded' : ''}`} data-testid="program-agent-page">
      <section className="program-agent-hero">
        <div className="program-agent-hero-main">
          <div className="program-agent-heading">
            <ProgramAgentAvatar size="lg" />
            <div>
               <div className="program-agent-status"><span /> برنامجك الدراسي</div>
                <h2>خطتك الكاملة لعشرة أيام.</h2>
                 <p>حدّد لكل حصة وقتها ومادتها، وشاهد مسار فهيم كاملًا أمامك. لا نعرض لك يومًا منفصلًا؛ نرتّب الصورة كاملة ثم نبدأ من المكان المناسب.</p>
            </div>
          </div>
          <div className="program-agent-actions">
            <button type="button" className="program-notification-button" onClick={toggleNotifications} data-testid="button-program-notifications">
              {notificationsEnabled ? <Bell size={17} /> : <BellOff size={17} />}
              {notificationsEnabled ? 'التنبيهات مفعّلة' : 'التنبيهات متوقفة'}
            </button>
            <button type="button" className="program-planner-button" onClick={() => setShowPlannerIntake(true)} data-testid="button-open-planner-intake">
              <Sparkles size={17} /> تهيئة خطة فهيم
            </button>
            <button type="button" className="program-add-button" onClick={() => setShowAddForm(true)} data-testid="button-add-program-event">
              <Plus size={17} /> إضافة موعد
            </button>
          </div>
        </div>
          <div className="program-rhythm-strip" aria-label="إيقاع خطة العشرة أيام">
              <div><strong>١٠</strong><span>أيام واضحة</span></div>
            <i />
             <div><strong>٣</strong><span>حصص لكل يوم</span></div>
            <i />
             <div><strong>٢</strong><span>مادتان أو أكثر</span></div>
             <span className="program-rhythm-note"><Clock3 size={13} /> عدّل الوقت والمادة كما يناسبك</span>
          </div>
      </section>

      <section className={`program-exam-mode-card ${examMode?.mode === 'error_stack' ? 'is-error-stack' : examMode?.mode === 'pre_exam' ? 'is-pre-exam' : ''}`} role="status" data-testid="card-exam-mode">
        <div className="program-exam-mode-icon"><Sparkles size={19} /></div>
        <div className="program-exam-mode-copy">
          <span className="program-card-kicker">الاستعداد للبكالوريا</span>
          <h3>{examMode?.label ?? 'نحدد إيقاع الاستعداد...'}</h3>
          <p>{examMode?.description ?? 'حدد تاريخ البكالوريا ليضبط توجيه كثافة التمارين تلقائيًا.'}</p>
          {examMode && examMode.mode !== 'standard' && (
            <div className="program-exam-mode-meta">
              <strong>{examMode.days_until >= 0 ? `بقي ${examMode.days_until} يومًا` : 'انتهى الموعد المحدد'}</strong>
              <span>كثافة التمارين ×{examMode.exercise_density}</span>
              {examMode.error_concepts.length > 0 && <span>{examMode.error_concepts.length} مفاهيم في بنك الأخطاء</span>}
            </div>
          )}
        </div>
        <label className="program-exam-date-control">
          <span>موعد البكالوريا</span>
          <input type="date" value={examDate} onChange={(event) => updateExamDate(event.target.value)} aria-label="موعد البكالوريا" data-testid="input-baccalaureate-date" />
        </label>
      </section>

      <div className="program-agent-layout">
        {penaltyEntries.length > 0 && (
          <section className="program-penalty-banner" role="status" data-testid="card-schedule-penalties">
            <div className="program-penalty-banner-heading">
              <div><span className="program-card-kicker"><Bell size={14} /> تعديلات تلقائية على خطتك</span><h3>الحصة الفائتة لا تختفي؛ نعيد ترتيب الطريق.</h3></div>
              <span className="program-penalty-count">{penaltyEntries.length}</span>
            </div>
            <div className="program-penalty-list">
              {penaltyEntries.slice(0, 6).map((entry) => (
                <div key={entry.id} className="program-penalty-row">
                  <div><strong>{entry.title}</strong><small>{entry.remediationLabel ?? (entry.missed ? 'حصة فائتة تحتاج تعويضًا' : 'تعديل تلقائي')}</small></div>
                  <span>{entry.volumeMultiplier && entry.volumeMultiplier > 1 ? '×٢ نهاية الأسبوع' : formatDate(entry.date)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <aside className="program-agent-aside">
          <div className="program-side-card program-phase-card">
            <div className="program-card-kicker"><Sparkles size={14} /> المسار الحالي</div>
            <h3>{plannerWindow.inFoundation ? 'المكتسبات الأساسية' : 'المراجعة المركّزة'}</h3>
            <p>{plannerWindow.inFoundation ? `فهيم يقودك في اليوم ${Math.min(plannerWindow.day, 10)} من ١٠ لتثبيت المفاهيم السابقة.` : 'اكتملت نافذة prior knowledge. يمكنك الآن رفع كثافة المراجعة المركّزة.'}</p>
            <div className="program-progress-label"><span>التقدم</span><strong>{plannerWindow.progress}٪</strong></div>
            <div className="program-progress"><span style={{ width: `${plannerWindow.progress}%` }} /></div>
            <div className="program-phase-days">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((day) => <span key={day} className={day < plannerWindow.day ? 'done' : day === plannerWindow.day ? 'current' : ''}>{day < plannerWindow.day ? <Check size={11} /> : day}</span>)}</div>
          </div>
           <div className="program-side-card program-network-card">
             <div className="program-card-kicker"><Sparkles size={14} /> شبكة المساعدة</div>
             <h3>ثلاثة وكلاء، مسار واحد.</h3>
             <div className="program-agent-network">
               {(['فهيم', 'تمارين', 'دليل'] as const).map((agent, index) => {
                 const profile = agentProfiles[agent];
                 return (
                   <div className="program-network-agent" key={agent}>
                     <ProgramMiniAgent agent={agent} />
                     <div><strong>{agent}</strong><small>{profile.role}</small></div>
                     {index < 2 && <ChevronDown size={13} className="program-network-link" />}
                   </div>
                 );
               })}
             </div>
             <p className="program-network-caption">فهيم يشرح، تمارين يختبر، ودليل يثبت ما تعلمته.</p>
           </div>
             <div className="program-side-note"><CalendarClock size={18} /><p>أضف اختبارًا أو فرضًا أو بحثًا عندما تعرفه؛ البرنامج يضع الخطوة المناسبة قبله تلقائيًا.</p></div>
        </aside>

        <section className="program-agent-workspace">
          <div className="program-workspace-toolbar">
            <div className="program-tabs" role="tablist" aria-label="واجهة البرنامج الدراسي">
              <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')} role="tab" aria-selected={activeTab === 'overview'} data-testid="tab-program-overview"><CalendarDays size={16} /> خطة ١٠ أيام</button>
              <button type="button" className={activeTab === 'events' ? 'active' : ''} onClick={() => setActiveTab('events')} role="tab" aria-selected={activeTab === 'events'} data-testid="tab-program-events"><ClipboardPenLine size={16} /> الاختبارات والفروض والبحوث</button>
              <button type="button" className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')} role="tab" aria-selected={activeTab === 'notifications'} data-testid="tab-program-notifications"><Bell size={16} /> التنبيهات</button>
            </div>
          </div>

           {activeTab === 'overview' && (
             <div className="program-plan-content">
              <div className="program-schedule-intro">
                 <div><span className="program-card-kicker"><CalendarDays size={14} /> الخطة الأساسية · ١٠ أيام</span><h3>اضبط حصصك قبل أن تبدأ.</h3><p>لكل يوم ثلاث خطوات: فهم، تطبيق، ثم تثبيت. يمكنك تعديل التوقيت والمادة من هنا في أي وقت.</p></div>
                 <div className="program-schedule-intro-tools">
                   <div className="program-plan-summary"><strong>{showAllPlanDays ? '٣٠' : '٣'}</strong><span>{showAllPlanDays ? 'حصة قابلة للضبط' : `حصص اليوم · اليوم ${focusedPlanDay}`}</span></div>
                   <button
                     type="button"
                     className="program-plan-view-toggle"
                     onClick={() => setShowAllPlanDays((current) => !current)}
                     aria-expanded={showAllPlanDays}
                     data-testid="button-toggle-plan-days"
                   >
                     <ChevronDown size={15} className={showAllPlanDays ? 'is-open' : ''} />
                     {showAllPlanDays ? 'إخفاء الأيام' : 'عرض الأيام العشرة'}
                   </button>
                 </div>
              </div>
               <div className="program-ten-day-list">
                 {readinessQuery.isLoading ? (
                   <div className="program-empty-state" role="status">نحضّر وحدات المنهاج لبناء برنامجك...</div>
                 ) : readinessQuery.isError || groundedSlots.length < 3 ? (
                   <div className="program-empty-state" role="alert">تعذر تحميل وحدات المنهاج الآن. أعد المحاولة بعد قليل.</div>
                 ) : visiblePlan.map(({ date, dayNumber, sessions }) => (
                   <section className="program-day-card" key={date} data-testid={`card-program-day-${dayNumber}`}>
                     <div className="program-day-heading">
                       <div><span className="program-day-number">اليوم {dayNumber}</span><h4>{formatDate(date)}</h4></div>
                       <span className="program-day-status">{dayNumber === plannerWindow.day ? 'أنت هنا' : dayNumber < plannerWindow.day ? 'مكتمل' : 'قادم'}</span>
                     </div>
                     <div className="program-plan-session-list">
                       {sessions.map((entry) => (
                         <ProgramPlanSession
                           key={entry.id}
                           entry={entry}
                           dayNumber={dayNumber}
                           onUpdate={(updates) => updatePlanSession(date, entry.slot as 1 | 2 | 3, updates)}
                           onToggle={() => toggleEntry(entry)}
                           onStart={() => startEntry(entry)}
                         />
                       ))}
                     </div>
                   </section>
                 ))}
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="program-events-content">
               <div className="program-schedule-intro"><div><span className="program-card-kicker"><ClipboardPenLine size={14} /> معلومات عند توفرها</span><h3>أضف الاختبار أو الفرض أو البحث.</h3><p>لا نطلب موعدًا في البداية. أضف الاختبار أو الفرض أو البحث عندما يصلك من المدرسة، وسيتكيّف برنامجك معه.</p></div><button type="button" className="program-inline-add" onClick={() => setShowAddForm(true)}><Plus size={15} /> أضف عند معرفته</button></div>
               <div className="program-later-card" role="note" data-testid="card-program-later-info"><span className="program-later-icon"><CalendarClock size={18} /></span><div><strong>هذه المساحة تنتظر موعدك القادم.</strong><p>يمكنك بدء التعلم الآن دون موعد. عند معرفة اختبار أو فرض أو بحث، أضفه هنا وسيضع البرنامج الخطوة المناسبة قبله.</p></div></div>
              <div className="program-event-list">
                {extraEvents.map((entry) => {
                  const { tone, icon: Icon } = kindStyles[entry.kind];
                  return <div key={entry.id} className="program-event-row"><span className={`program-event-icon ${tone}`}><Icon size={17} /></span><div><strong>{entry.title}</strong><small>{entry.subject} · {entry.kind}</small></div><time>{formatDate(entry.date)}<br />{entry.time}</time></div>;
                })}
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="program-notifications-content">
              <div className="program-notification-cover"><span className="program-notification-big-icon"><Bell size={22} /></span><div><span className="program-card-kicker">مراقبة هادئة</span><h3>مِيزان يذكّرك قبل أن تتشتت.</h3><p>ستصلك تنبيهات الحصص، الاختبارات، والمهام التي أضفتها إلى برنامجك.</p></div><button type="button" className={`program-toggle ${notificationsEnabled ? 'is-on' : ''}`} onClick={toggleNotifications} aria-label="تفعيل أو إيقاف التنبيهات" data-testid="toggle-program-notifications"><span /></button></div>
             <div className="program-notification-list">
               <div><Clock3 size={16} /><span><strong>قبل بداية الحصة</strong><small>تنبيه عند اقتراب موعد البداية</small></span><b>{notificationsEnabled ? 'مفعّل' : 'متوقف'}</b></div>
               <div><ClipboardPenLine size={16} /><span><strong>قبل الاختبار أو الفرض أو البحث</strong><small>رفع كثافة المراجعة قبل الموعد</small></span><b>{notificationsEnabled ? 'مفعّل' : 'متوقف'}</b></div>
               <div><Sparkles size={16} /><span><strong>{examMode?.label ?? 'وضع الاستعداد'}</strong><small>{examMode?.mode === 'error_stack' ? 'إشعار عند تفعيل مكدسات الأخطاء وربطها بمفاهيمك' : 'يتغير تلقائيًا حسب قرب موعد البكالوريا'}</small></span><b>{examMode?.mode === 'standard' ? 'مراقبة' : 'مفعّل'}</b></div>
               <div><CheckCircle2 size={16} /><span><strong>بعد التأخر</strong><small>اقتراح حصة تعويضية في البرنامج</small></span><b>{notificationsEnabled ? 'مفعّل' : 'متوقف'}</b></div>
             </div>
            </div>
          )}
        </section>
      </div>

      {showPlannerIntake && (
        <div className="program-planner-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPlannerIntake(false); }}>
          <div className="program-planner-modal" onMouseDown={(event) => event.stopPropagation()}>
            <PlannerIntakeCard
              initialValues={(() => {
                try {
                  return JSON.parse(localStorage.getItem('tawjeeh.phase1.planner.v1') || '{}') as Partial<PlannerIntakeValues>;
                } catch {
                  return {};
                }
              })()}
              onBack={() => setShowPlannerIntake(false)}
              onSubmit={handlePlannerSubmit}
            />
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="program-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddForm(false); }}>
          <form className="program-add-modal" onSubmit={addEntry} onMouseDown={(event) => event.stopPropagation()} data-testid="form-add-program-event">
            <div className="program-modal-header"><div><span className="program-card-kicker"><Plus size={14} /> موعد جديد</span><h3>أضف شيئًا إلى برنامجك</h3></div><button type="button" className="program-modal-close" onClick={() => setShowAddForm(false)} aria-label="إغلاق"><X size={18} /></button></div>
             <label>اسم الدرس أو الموعد<input required value={newEntry.title} onChange={(event) => setNewEntry((current) => ({ ...current, title: event.target.value }))} placeholder="اكتب الاسم كما ورد في مستنداتك" autoFocus /></label>
             <div className="program-form-grid"><label>النوع<select value={newEntry.kind} onChange={(event) => setNewEntry((current) => ({ ...current, kind: event.target.value as ProgramKind }))}><option>اختبار</option><option>فرض</option><option>بحث</option></select></label><label>المادة<select value={newEntry.subject} onChange={(event) => setNewEntry((current) => ({ ...current, subject: event.target.value }))}><option>الرياضيات</option><option>الفيزياء</option></select></label></div>
             <div className="program-form-grid"><label>التاريخ<input type="date" value={newEntry.date} onChange={(event) => setNewEntry((current) => ({ ...current, date: event.target.value }))} /></label><label>وقت البداية<input type="time" value={newEntry.time} onChange={(event) => setNewEntry((current) => ({ ...current, time: event.target.value }))} /></label></div>
             <label>مدة الحصة<select value={newEntry.duration} onChange={(event) => setNewEntry((current) => ({ ...current, duration: event.target.value }))}><option>20 دقيقة</option><option>30 دقيقة</option><option>45 دقيقة</option><option>60 دقيقة</option><option>90 دقيقة</option></select></label>
             <p className="program-modal-hint"><CalendarClock size={14} /> سيضع البرنامج الموعد الأنسب، وتبقى نهاية الحصة مرتبطة بتجاوبك لا بساعة ثابتة.</p>
            <div className="program-modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAddForm(false)}>إلغاء</button><button type="submit" className="primary-button"><Plus size={16} /> إضافة إلى البرنامج</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
