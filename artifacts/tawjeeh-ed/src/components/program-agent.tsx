import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import {
  Bell,
  BellOff,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Search,
  Sparkles,
  Target,
  Timer,
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
import { getAgentReadinessQueryOptions } from '@/lib/agent-readiness';
import owlAgentTeal from '@assets/agent-guiding-cropped.png';
import owlAgentThinking from '@assets/agent-thinking-cropped.png';
import owlAgentSuccess from '@assets/agent-success-cropped.png';

type ProgramKind = 'مكتسبات' | 'حصة تطبيقية' | 'مراجعة';
type SessionTrack = 'theory' | 'application';

type ProgramEntry = {
  id: string;
  date: string;
  time: string;
  duration?: string;
  title: string;
  subject: string;
  kind: ProgramKind;
  agent: 'فهيم' | 'دليل' | 'وكيل التمارين';
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
function normalizeProgramSubject(subject?: string) {
  return subject === 'الرياضيات' ? 'الرياضيات' : 'الفيزياء';
}

type FoundationalModule = {
  nodeId: string;
  title: string;
  studyTitle: string;
  summary: string;
  source: string;
  page: number;
};

function createGroundedSlots(
  modules: FoundationalModule[],
  phase: 'foundation' | 'actual',
): Omit<ProgramEntry, 'id' | 'date' | 'completed'>[] {
  if (modules.length < 3) return [];
  const tracks = [
    { time: '08:30', duration: '25–40 دقيقة', kind: 'مكتسبات' as const, foundationTitle: 'تثبيت أساسيات الحركة', agent: 'فهيم' as const, slot: 1 as const, track: 'theory' as const, endRule: 'تنتهي عندما تشرح الفكرة بكلماتك' },
    { time: '12:00', duration: 'حتى حل موضوعين', kind: 'حصة تطبيقية' as const, foundationTitle: 'موضوعات إبداعية على القوى والتسارع', agent: 'وكيل التمارين' as const, slot: 2 as const, track: 'application' as const, endRule: 'تتوقف عند أول إجابة تحتاج تصحيحًا' },
    { time: '17:30', duration: 'حتى إجابة التحقق', kind: 'مراجعة' as const, foundationTitle: 'مراجعة ما تم فهمه', agent: 'دليل' as const, slot: 3 as const, track: 'application' as const, endRule: 'تنتهي بعد إجابة قصيرة تثبت التقدم' },
  ];
  return tracks.map((track, index) => ({
    ...track,
    title: phase === 'actual' ? modules[index].studyTitle : track.foundationTitle,
    subject: 'الفيزياء',
  }));
}

const kindStyles: Record<ProgramKind, { tone: string; icon: typeof BookOpenCheck }> = {
  مكتسبات: { tone: 'program-tone-sky', icon: BookOpenCheck },
  'حصة تطبيقية': { tone: 'program-tone-teal', icon: Target },
  مراجعة: { tone: 'program-tone-violet', icon: Search },
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
    agent: isTheory ? 'فهيم' : isPractical ? 'وكيل التمارين' : 'دليل',
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
  'وكيل التمارين': { image: owlAgentSuccess, role: 'يحوّلها إلى تمرين أو موضوع مختلف', tone: 'exercises' },
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
  onUpdate: (updates: Pick<ProgramEntry, 'time'>) => void;
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
      <div className="program-plan-agent-choice" title="يحددها الوكيل حسب مستواك">
        <span>يحددها الوكيل</span>
        <strong>{entry.subject}</strong>
      </div>
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
  const { user } = useUser();
  const [entries, setEntries] = useState<ProgramEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'notifications'>('overview');
  const [showAllPlanDays, setShowAllPlanDays] = useState(false);
  const [showPlannerIntake, setShowPlannerIntake] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'default' : Notification.permission,
  );
  const [examDate, setExamDate] = useState(() => localStorage.getItem(examDateKey) || defaultExamDate);
  const [entryDate, setEntryDate] = useState(() => localStorage.getItem('tawjeeh.phase1.entryDate') || today);
  const scheduleQuery = useGetLearningSchedule({
    query: {
      queryKey: getGetLearningScheduleQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const readinessQuery = useQuery(getAgentReadinessQueryOptions(user?.id));
  const foundationWindowActive = useMemo(() => {
    const start = new Date(`${entryDate}T12:00:00`);
    const current = new Date(`${today}T12:00:00`);
    const dayDifference = Math.floor((current.getTime() - start.getTime()) / 86_400_000);
    return dayDifference >= 0 && dayDifference < 10;
  }, [entryDate]);
  const groundedSlots = useMemo(
    () => createGroundedSlots(
      readinessQuery.data?.foundationalModules ?? [],
      foundationWindowActive ? 'foundation' : 'actual',
    ),
    [foundationWindowActive, readinessQuery.data?.foundationalModules],
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
        createDailySessions(date, groundedSlots).map((session) => {
          const savedSession = savedSessions.get(`${date}-${session.slot}`);
          return savedSession ? { ...savedSession, title: session.title } : session;
        }),
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
    updates: Pick<ProgramEntry, 'time'>,
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

  return (
    <div className={`program-agent-page ${embedded ? 'is-embedded' : ''}`} data-testid="program-agent-page">
      <section className="program-agent-hero">
        <div className="program-agent-hero-main">
          <div className="program-agent-heading">
            <ProgramAgentAvatar size="lg" />
            <div>
               <div className="program-agent-status"><span /> برنامجك الدراسي</div>
                <h2>خطتك الكاملة لعشرة أيام.</h2>
                  <p>يختار فهيم المادة والمحور والتطبيق المناسب لمستواك تلقائيًا. اضبط وقت الحصة فقط، وشاهد مسارك الكامل قبل أن تبدأ.</p>
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
          </div>
        </div>
          <div className="program-rhythm-strip" aria-label="إيقاع خطة العشرة أيام">
              <div><strong>١٠</strong><span>أيام واضحة</span></div>
            <i />
             <div><strong>٣</strong><span>حصص لكل يوم</span></div>
            <i />
             <div><strong>٢</strong><span>مادتان أو أكثر</span></div>
              <span className="program-rhythm-note"><Clock3 size={13} /> عدّل وقت الحصة فقط · الباقي يحدده فهيم</span>
          </div>
      </section>

      <section className={`program-exam-mode-card ${examMode?.mode === 'error_stack' ? 'is-error-stack' : examMode?.mode === 'pre_exam' ? 'is-pre-exam' : ''}`} role="status" data-testid="card-exam-mode">
        <div className="program-exam-mode-icon"><Sparkles size={19} /></div>
        <div className="program-exam-mode-copy">
          <span className="program-card-kicker">الاستعداد للبكالوريا</span>
          <h3>{examMode?.label ?? 'نحدد إيقاع الاستعداد...'}</h3>
           <p>{examMode?.description ?? 'أدخل موعد الاختبار فقط، وسيضبط توجيه كثافة التطبيقات والمحاور تلقائيًا.'}</p>
          {examMode && examMode.mode !== 'standard' && (
            <div className="program-exam-mode-meta">
              <strong>{examMode.days_until >= 0 ? `بقي ${examMode.days_until} يومًا` : 'انتهى الموعد المحدد'}</strong>
              <span>كثافة التمارين ×{examMode.exercise_density}</span>
              {examMode.error_concepts.length > 0 && <span>{examMode.error_concepts.length} مفاهيم في بنك الأخطاء</span>}
            </div>
          )}
        </div>
        <label className="program-exam-date-control">
           <span>موعد الاختبار</span>
           <input type="date" value={examDate} onChange={(event) => updateExamDate(event.target.value)} aria-label="موعد الاختبار" data-testid="input-baccalaureate-date" />
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
            <h3>{plannerWindow.inFoundation ? 'المكتسبات الأساسية' : 'الدراسة الفعلية'}</h3>
            <p>{plannerWindow.inFoundation ? `فهيم يقودك في اليوم ${Math.min(plannerWindow.day, 10)} من ١٠ لتثبيت المفاهيم السابقة.` : 'اكتملت المرحلة التأسيسية. تظهر هنا محاور المنهاج للدراسة الفعلية خطوةً خطوة.'}</p>
            <div className="program-progress-label"><span>التقدم</span><strong>{plannerWindow.progress}٪</strong></div>
            <div className="program-progress"><span style={{ width: `${plannerWindow.progress}%` }} /></div>
            <div className="program-phase-days">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((day) => <span key={day} className={day < plannerWindow.day ? 'done' : day === plannerWindow.day ? 'current' : ''}>{day < plannerWindow.day ? <Check size={11} /> : day}</span>)}</div>
          </div>
             <div className="program-side-note"><CalendarClock size={18} /><p>لا تحتاج إلى تحديد ما سيأتي في الاختبار. يقرأ الوكيل تقدمك وبنك أخطائك ويكثّف التطبيقات المناسبة قبل الموعد.</p></div>
        </aside>

        <section className="program-agent-workspace">
          <div className="program-workspace-toolbar">
            <div className="program-tabs" role="tablist" aria-label="واجهة البرنامج الدراسي">
              <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')} role="tab" aria-selected={activeTab === 'overview'} data-testid="tab-program-overview"><CalendarDays size={16} /> خطة ١٠ أيام</button>
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

          {activeTab === 'notifications' && (
            <div className="program-notifications-content">
              <div className="program-notification-cover"><span className="program-notification-big-icon"><Bell size={22} /></span><div><span className="program-card-kicker">مراقبة هادئة</span><h3>مِيزان يذكّرك قبل أن تتشتت.</h3><p>ستصلك تنبيهات الحصص، الاختبارات، والمهام التي أضفتها إلى برنامجك.</p></div><button type="button" className={`program-toggle ${notificationsEnabled ? 'is-on' : ''}`} onClick={toggleNotifications} aria-label="تفعيل أو إيقاف التنبيهات" data-testid="toggle-program-notifications"><span /></button></div>
             <div className="program-notification-list">
               <div><Clock3 size={16} /><span><strong>قبل بداية الحصة</strong><small>تنبيه عند اقتراب موعد البداية</small></span><b>{notificationsEnabled ? 'مفعّل' : 'متوقف'}</b></div>
                <div><Target size={16} /><span><strong>قبل موعد الاختبار</strong><small>رفع كثافة التطبيقات تلقائيًا قبل الموعد</small></span><b>{notificationsEnabled ? 'مفعّل' : 'متوقف'}</b></div>
               <div><Sparkles size={16} /><span><strong>{examMode?.label ?? 'وضع الاستعداد'}</strong><small>{examMode?.mode === 'error_stack' ? 'إشعار عند تفعيل مكدسات الأخطاء وربطها بمفاهيمك' : 'يتغير تلقائيًا حسب قرب موعد البكالوريا'}</small></span><b>{examMode?.mode === 'standard' ? 'مراقبة' : 'مفعّل'}</b></div>
                <div><CheckCircle2 size={16} /><span><strong>بعد التعثر</strong><small>يضيف الوكيل تطبيقات علاجية من بنك الأخطاء</small></span><b>{notificationsEnabled ? 'مفعّل' : 'متوقف'}</b></div>
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

    </div>
  );
}
