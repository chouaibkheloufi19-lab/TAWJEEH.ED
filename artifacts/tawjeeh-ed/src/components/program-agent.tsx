import { type FormEvent, useEffect, useMemo, useState } from 'react';
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
  getGetLearningScheduleQueryKey,
  useGetLearningSchedule,
  useUpdateLearningSchedule,
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
const subjectOptions = ['الفيزياء', 'الرياضيات', 'العلوم الطبيعية', 'اللغة العربية'];
const initialEntries: ProgramEntry[] = [
  { id: 'program-1', date: today, time: '08:30', duration: '25–40 دقيقة', title: 'فهم الفكرة الأساسية', subject: 'العلوم الفيزيائية', kind: 'مكتسبات', agent: 'فهيم', completed: true, slot: 1, track: 'theory', endRule: 'تنتهي عندما تشرحين الفكرة بكلماتك' },
  { id: 'program-2', date: today, time: '12:00', duration: 'حتى حل تمرينين', title: 'تطبيق موجّه', subject: 'العلوم الفيزيائية', kind: 'حصة تطبيقية', agent: 'تمارين', completed: false, slot: 2, track: 'application', endRule: 'تتوقف عند أول إجابة تحتاج تصحيحًا' },
  { id: 'program-3', date: today, time: '17:30', duration: 'حتى إجابة التحقق', title: 'تثبيت واسترجاع', subject: 'العلوم الفيزيائية', kind: 'مراجعة', agent: 'دليل', completed: false, slot: 3, track: 'application', endRule: 'تنتهي بعد إجابة قصيرة تثبت التقدم' },
  { id: 'program-4', date: addDays(today, 2), time: '16:00', duration: '45 دقيقة', title: 'الميكانيك', subject: 'الفيزياء', kind: 'فرض', agent: 'تمارين', completed: false },
];

const smartSlots: Omit<ProgramEntry, 'id' | 'date' | 'completed'>[] = [
  { time: '08:30', duration: '25–40 دقيقة', title: 'فهم الفكرة الأساسية', subject: 'العلوم الفيزيائية', kind: 'مكتسبات', agent: 'فهيم', slot: 1, track: 'theory', endRule: 'تنتهي عندما تشرحين الفكرة بكلماتك' },
  { time: '12:00', duration: 'حتى حل تمرينين', title: 'تطبيق موجّه', subject: 'العلوم الفيزيائية', kind: 'حصة تطبيقية', agent: 'تمارين', slot: 2, track: 'application', endRule: 'تتوقف عند أول إجابة تحتاج تصحيحًا' },
  { time: '17:30', duration: 'حتى إجابة التحقق', title: 'تثبيت واسترجاع', subject: 'العلوم الفيزيائية', kind: 'مراجعة', agent: 'دليل', slot: 3, track: 'application', endRule: 'تنتهي بعد إجابة قصيرة تثبت التقدم' },
];

const kindStyles: Record<ProgramKind, { tone: string; icon: typeof BookOpenCheck }> = {
  مكتسبات: { tone: 'program-tone-sky', icon: BookOpenCheck },
  'حصة تطبيقية': { tone: 'program-tone-teal', icon: Target },
  مراجعة: { tone: 'program-tone-violet', icon: Search },
  اختبار: { tone: 'program-tone-amber', icon: ClipboardPenLine },
  فرض: { tone: 'program-tone-rose', icon: ClipboardPenLine },
  بحث: { tone: 'program-tone-blue', icon: FilePlus2 },
};

function readEntries(): ProgramEntry[] {
  try {
    const saved = localStorage.getItem('tawjeeh.program.entries');
    if (!saved) return initialEntries;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return initialEntries;
    const legacyToday = parsed.filter((entry): entry is ProgramEntry => entry?.date === today && !entry?.slot).slice(0, 3);
    const savedSessions = parsed.filter((entry): entry is ProgramEntry => entry?.slot && entry?.date);
    const todaySessions = smartSlots.map((slot, index) => ({
      ...slot,
      id: `program-${index + 1}`,
      date: today,
      completed: savedSessions.find((entry) => entry.date === today && entry.slot === slot.slot)?.completed
        ?? legacyToday[index]?.completed
        ?? false,
      title: savedSessions.find((entry) => entry.date === today && entry.slot === slot.slot)?.title
        ?? legacyToday[index]?.title
        ?? slot.title,
      subject: savedSessions.find((entry) => entry.date === today && entry.slot === slot.slot)?.subject
        ?? legacyToday[index]?.subject
        ?? slot.subject,
    }));
    const nonSessionEntries = parsed.filter((entry): entry is ProgramEntry => entry?.date && !entry?.slot);
    return [...todaySessions, ...nonSessionEntries];
  } catch {
    return initialEntries;
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ar-DZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
}

function createDailySessions(date: string, seed?: ProgramEntry): ProgramEntry[] {
  return smartSlots.map((slot, index) => ({
    ...slot,
    id: `smart-${date}-${index + 1}`,
    date,
    subject: seed?.subject ?? slot.subject,
    completed: false,
  }));
}

function toProgramEntry(entry: ScheduleEntry): ProgramEntry {
  return {
    id: `remediation-${entry.id}`,
    serverId: entry.id,
    date: entry.scheduled_date,
    time: entry.time,
    duration: entry.duration,
    title: entry.title,
    subject: entry.subject,
    kind: 'مراجعة',
    agent: 'دليل',
    completed: entry.completed,
    remediationLabel: entry.remediation_label,
    track: 'application',
    endRule: 'تستمر حتى تثبيت المفهوم المرتبط بالخطأ',
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
  onStart,
}: {
  entry: ProgramEntry;
  dayNumber: number;
  onUpdate: (updates: Partial<Pick<ProgramEntry, 'time' | 'subject'>>) => void;
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
    </article>
  );
}

export function ProgramAgent({ embedded = false }: ProgramAgentProps) {
  const [, setLocation] = useLocation();
  const [entries, setEntries] = useState<ProgramEntry[]>(initialEntries);
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'notifications'>('overview');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPlannerIntake, setShowPlannerIntake] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'default' : Notification.permission,
  );
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
  const updateScheduleMutation = useUpdateLearningSchedule();
  const remediationEntries = useMemo(
    () => (scheduleQuery.data ?? []).map(toProgramEntry),
    [scheduleQuery.data],
  );

  useEffect(() => {
    setEntries(readEntries());
    setNotificationsEnabled(localStorage.getItem('tawjeeh.program.notifications') !== 'off');
    const savedEntryDate = localStorage.getItem('tawjeeh.phase1.entryDate');
    if (savedEntryDate) setEntryDate(savedEntryDate);
  }, []);

  useEffect(() => {
    localStorage.setItem('tawjeeh.program.entries', JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    setEntries((current) => {
      const tenDayDates = Array.from({ length: 10 }, (_, index) => addDays(entryDate, index));
      const planKeys = new Set(tenDayDates.flatMap((date) => [1, 2, 3].map((slot) => `${date}-${slot}`)));
      const savedSessions = new Map(
        current
          .filter((entry) => entry.slot && entry.date)
          .map((entry) => [`${entry.date}-${entry.slot}`, entry]),
      );
      const planSessions = tenDayDates.flatMap((date) =>
        createDailySessions(date).map((session) => savedSessions.get(`${date}-${session.slot}`) ?? session),
      );
      const nonPlanEntries = current.filter((entry) => !entry.slot || !planKeys.has(`${entry.date}-${entry.slot}`));
      return [...planSessions, ...nonPlanEntries];
    });
  }, [entryDate]);

  const tenDayPlan = useMemo(() => {
    return Array.from({ length: 10 }, (_, dayIndex) => {
      const date = addDays(entryDate, dayIndex);
      return {
        date,
        dayNumber: dayIndex + 1,
        sessions: [1, 2, 3].map((slot) =>
          entries.find((entry) => entry.date === date && entry.slot === slot)
          ?? createDailySessions(date)[slot - 1],
        ),
      };
    });
  }, [entries, entryDate]);

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
      const fallback = createDailySessions(date)[slot - 1];
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

  const handlePlannerSubmit = (values: PlannerIntakeValues) => {
    const savedDate = localStorage.getItem('tawjeeh.phase1.entryDate') || today;
    localStorage.setItem('tawjeeh.phase1.planner.v1', JSON.stringify(values));
    localStorage.setItem('tawjeeh.phase1.entryDate', savedDate);
    setEntryDate(savedDate);
    setShowPlannerIntake(false);
    setActiveTab('overview');
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

      <div className="program-agent-layout">
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
                 <div className="program-plan-summary"><strong>٣٠</strong><span>حصة قابلة للضبط</span></div>
              </div>
               <div className="program-ten-day-list">
                 {tenDayPlan.map(({ date, dayNumber, sessions }) => (
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
            <div className="program-notification-list"><div><Clock3 size={16} /><span><strong>قبل بداية الحصة</strong><small>تنبيه عند اقتراب موعد البداية</small></span><b>مفعّل</b></div><div><ClipboardPenLine size={16} /><span><strong>قبل الاختبار أو الفرض أو البحث</strong><small>رفع كثافة المراجعة قبل الموعد</small></span><b>مفعّل</b></div><div><Sparkles size={16} /><span><strong>بعد التأخر</strong><small>اقتراح حصة تعويضية في البرنامج</small></span><b>مفعّل</b></div></div>
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
             <div className="program-form-grid"><label>النوع<select value={newEntry.kind} onChange={(event) => setNewEntry((current) => ({ ...current, kind: event.target.value as ProgramKind }))}><option>اختبار</option><option>فرض</option><option>بحث</option></select></label><label>المادة<select value={newEntry.subject} onChange={(event) => setNewEntry((current) => ({ ...current, subject: event.target.value }))}><option>الفيزياء</option><option>الرياضيات</option><option>العلوم الطبيعية</option><option>اللغة العربية</option></select></label></div>
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
