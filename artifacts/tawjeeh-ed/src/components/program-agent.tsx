import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardPenLine,
  Clock3,
  FilePlus2,
  GraduationCap,
  Plus,
  Search,
  Sparkles,
  Target,
  Timer,
  X,
} from 'lucide-react';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';
import { useLocation } from 'wouter';

type ProgramKind = 'مكتسبات' | 'حصة تطبيقية' | 'مراجعة' | 'اختبار' | 'فرض' | 'بحث' | 'عطلة';

type ProgramEntry = {
  id: string;
  date: string;
  time: string;
  title: string;
  subject: string;
  kind: ProgramKind;
  agent: 'فهيم' | 'دليل' | 'تمارين';
  completed: boolean;
};

type ProgramAgentProps = {
  embedded?: boolean;
};

const today = '2024-06-12';
const initialEntries: ProgramEntry[] = [
  { id: 'program-1', date: today, time: '08:30', title: 'قوانين نيوتن والحركة', subject: 'الفيزياء', kind: 'مكتسبات', agent: 'فهيم', completed: true },
  { id: 'program-2', date: today, time: '10:00', title: 'تطبيقات على الحركة', subject: 'الفيزياء', kind: 'حصة تطبيقية', agent: 'تمارين', completed: false },
  { id: 'program-3', date: today, time: '17:30', title: 'كويز تثبيت المكتسبات', subject: 'الفيزياء', kind: 'اختبار', agent: 'تمارين', completed: false },
  { id: 'program-4', date: '2024-06-14', time: '16:00', title: 'فرض قصير في الدوال', subject: 'الرياضيات', kind: 'فرض', agent: 'تمارين', completed: false },
  { id: 'program-5', date: '2024-06-15', time: '11:00', title: 'بحث: تطبيقات الطاقة في الحياة', subject: 'العلوم الطبيعية', kind: 'بحث', agent: 'دليل', completed: false },
];

const kindStyles: Record<ProgramKind, { tone: string; icon: typeof BookOpenCheck }> = {
  مكتسبات: { tone: 'program-tone-sky', icon: BookOpenCheck },
  'حصة تطبيقية': { tone: 'program-tone-teal', icon: Target },
  مراجعة: { tone: 'program-tone-violet', icon: Search },
  اختبار: { tone: 'program-tone-amber', icon: ClipboardPenLine },
  فرض: { tone: 'program-tone-rose', icon: ClipboardPenLine },
  بحث: { tone: 'program-tone-blue', icon: FilePlus2 },
  عطلة: { tone: 'program-tone-sand', icon: CalendarDays },
};

const agentLabels = {
  فهيم: 'يثبّت المفاهيم',
  دليل: 'يشرح لك بهدوء',
  تمارين: 'يدرّبك بذكاء',
};

function readEntries(): ProgramEntry[] {
  try {
    const saved = localStorage.getItem('tawjeeh.program.entries');
    if (!saved) return initialEntries;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : initialEntries;
  } catch {
    return initialEntries;
  }
}

function formatDate(date: string) {
  if (date === today) return 'اليوم · الأربعاء ١٢ جوان';
  const [, month, day] = date.split('-');
  return `${Number(day)} جوان`;
}

function ProgramAgentAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'program-avatar-lg' : size === 'sm' ? 'program-avatar-sm' : 'program-avatar-md';
  return (
    <span className={`program-agent-avatar ${dimensions}`}>
      <img src={owlLogoPath} alt="بومة وكيل البرنامج" />
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
        <span>تبدأ</span>
        <strong>{entry.time}</strong>
        <small><Timer size={12} /> بلا نهاية محددة</small>
      </div>
      <div className={`program-entry-icon ${tone}`}><Icon size={19} /></div>
      <div className="program-entry-content">
        <div className="program-entry-meta">
          <span className={`program-kind ${tone}`}>{entry.kind}</span>
          <span>{entry.subject}</span>
        </div>
        <h3>{entry.title}</h3>
        <p>{entry.agent} · {agentLabels[entry.agent]}</p>
      </div>
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

export function ProgramAgent({ embedded = false }: ProgramAgentProps) {
  const [, setLocation] = useLocation();
  const [entries, setEntries] = useState<ProgramEntry[]>(initialEntries);
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeTab, setActiveTab] = useState<'schedule' | 'events' | 'notifications'>('schedule');
  const [showAddForm, setShowAddForm] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [activeEntry, setActiveEntry] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState({
    date: today,
    time: '18:00',
    title: '',
    subject: 'الفيزياء',
    kind: 'اختبار' as ProgramKind,
  });

  useEffect(() => {
    setEntries(readEntries());
    setNotificationsEnabled(localStorage.getItem('tawjeeh.program.notifications') !== 'off');
  }, []);

  useEffect(() => {
    localStorage.setItem('tawjeeh.program.entries', JSON.stringify(entries));
  }, [entries]);

  const dates = useMemo(() => {
    const uniqueDates = Array.from(new Set(entries.map((entry) => entry.date)));
    return uniqueDates.sort();
  }, [entries]);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
    [entries, selectedDate],
  );

  const extraEvents = useMemo(
    () => entries.filter((entry) => ['اختبار', 'فرض', 'بحث', 'عطلة'].includes(entry.kind)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [entries],
  );

  const completedCount = entries.filter((entry) => entry.completed).length;
  const commitment = entries.length ? Math.round((completedCount / entries.length) * 100) : 0;

  const toggleEntry = (id: string) => {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, completed: !entry.completed } : entry));
  };

  const startEntry = (entry: ProgramEntry) => {
    setActiveEntry(entry.id);
    setActiveTab('schedule');
    if (entry.kind === 'مكتسبات' || entry.kind === 'حصة تطبيقية' || entry.kind === 'مراجعة') {
      setLocation(`/lesson/${entry.id}`);
    }
  };

  const toggleNotifications = () => {
    setNotificationsEnabled((enabled) => {
      const next = !enabled;
      localStorage.setItem('tawjeeh.program.notifications', next ? 'on' : 'off');
      return next;
    });
  };

  const addEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newEntry.title.trim()) return;
    const entry: ProgramEntry = {
      id: `program-${Date.now()}`,
      date: newEntry.date,
      time: newEntry.time,
      title: newEntry.title.trim(),
      subject: newEntry.subject,
      kind: newEntry.kind,
      agent: newEntry.kind === 'بحث' ? 'دليل' : newEntry.kind === 'مكتسبات' ? 'فهيم' : 'تمارين',
      completed: false,
    };
    setEntries((current) => [...current, entry]);
    setSelectedDate(entry.date);
    setShowAddForm(false);
    setActiveTab('schedule');
    setNewEntry((current) => ({ ...current, title: '' }));
  };

  return (
    <div className={`program-agent-page ${embedded ? 'is-embedded' : ''}`} data-testid="program-agent-page">
      <section className="program-agent-hero">
        <div className="program-agent-hero-main">
          <div className="program-agent-heading">
            <ProgramAgentAvatar size="lg" />
            <div>
              <div className="program-agent-status"><span /> وكيل البرنامج · متصل الآن</div>
              <h2>أنا مِيزان، أرتّب يومك الدراسي.</h2>
              <p>أبني لك برنامجًا واقعيًا حسب وقت دخولك، وأربط كل حصة بالوكيل المناسب دون أن تضيع منك الخطوة التالية.</p>
            </div>
          </div>
          <div className="program-agent-actions">
            <button type="button" className="program-notification-button" onClick={toggleNotifications} data-testid="button-program-notifications">
              {notificationsEnabled ? <Bell size={17} /> : <BellOff size={17} />}
              {notificationsEnabled ? 'التنبيهات مفعّلة' : 'التنبيهات متوقفة'}
            </button>
            <button type="button" className="program-add-button" onClick={() => setShowAddForm(true)} data-testid="button-add-program-event">
              <Plus size={17} /> إضافة موعد
            </button>
          </div>
        </div>
        <div className="program-agent-stats">
          <div><span>مرحلة المكتسبات</span><strong>اليوم ٤ <small>/ ١٠</small></strong><em>فهيم يقود البداية</em></div>
          <div><span>نسبة الالتزام</span><strong>{commitment}%</strong><em>تتغير مع كل حصة</em></div>
          <div><span>حصص اليوم</span><strong>{entries.filter((entry) => entry.date === today).length}</strong><em>تبدأ حسب توقيتك</em></div>
        </div>
      </section>

      <div className="program-agent-layout">
        <aside className="program-agent-aside">
          <div className="program-side-card program-phase-card">
            <div className="program-card-kicker"><Sparkles size={14} /> المسار الحالي</div>
            <h3>المكتسبات الأساسية</h3>
            <p>عشرة أيام لتثبيت المفاهيم السابقة قبل الدخول في المراجعة المركّزة.</p>
            <div className="program-progress-label"><span>التقدم</span><strong>٤٠٪</strong></div>
            <div className="program-progress"><span style={{ width: '40%' }} /></div>
            <div className="program-phase-days">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((day) => <span key={day} className={day < 4 ? 'done' : day === 4 ? 'current' : ''}>{day < 4 ? <Check size={11} /> : day}</span>)}</div>
          </div>
          <div className="program-side-card">
            <div className="program-card-kicker"><GraduationCap size={14} /> الوكلاء المتصلون</div>
            <div className="program-connected-agent"><span className="program-mini-avatar fahim">ف</span><div><strong>فَهيم</strong><small>المكتسبات والفجوات</small></div><i /></div>
            <div className="program-connected-agent"><span className="program-mini-avatar dalil">د</span><div><strong>دليل</strong><small>الشرح والملخصات</small></div><i /></div>
            <div className="program-connected-agent"><span className="program-mini-avatar exercises">ت</span><div><strong>التمارين</strong><small>التطبيق والكويزات</small></div><i /></div>
          </div>
          <div className="program-side-note"><CalendarClock size={18} /><p>أضف موعد فرض أو اختبار، وسأضعه في البرنامج وأرفع كثافة التدريب قبله.</p></div>
        </aside>

        <section className="program-agent-workspace">
          <div className="program-workspace-toolbar">
            <div className="program-tabs" role="tablist" aria-label="واجهة وكيل البرنامج">
              <button type="button" className={activeTab === 'schedule' ? 'active' : ''} onClick={() => setActiveTab('schedule')} role="tab" aria-selected={activeTab === 'schedule'} data-testid="tab-program-schedule"><CalendarDays size={16} /> البرنامج اليومي</button>
              <button type="button" className={activeTab === 'events' ? 'active' : ''} onClick={() => setActiveTab('events')} role="tab" aria-selected={activeTab === 'events'} data-testid="tab-program-events"><ClipboardPenLine size={16} /> الاختبارات والمواعيد</button>
              <button type="button" className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')} role="tab" aria-selected={activeTab === 'notifications'} data-testid="tab-program-notifications"><Bell size={16} /> التنبيهات</button>
            </div>
            {activeTab === 'schedule' && (
              <select className="program-date-select" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="اختر يوم البرنامج" data-testid="select-program-date">
                {dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
              </select>
            )}
          </div>

          {activeTab === 'schedule' && (
            <div className="program-schedule-content">
              <div className="program-schedule-intro">
                <div><span className="program-card-kicker"><Clock3 size={14} /> {formatDate(selectedDate)}</span><h3>خطوتك التالية واضحة.</h3><p>كل حصة لها بداية، وعندما تنتهي منها ننتقل للخطوة التي بعدها.</p></div>
                <div className="program-today-progress"><strong>{visibleEntries.filter((entry) => entry.completed).length}/{visibleEntries.length}</strong><span>حصص مكتملة</span></div>
              </div>
              <div className="program-entries">
                {visibleEntries.length ? visibleEntries.map((entry) => (
                  <div key={entry.id} className={activeEntry === entry.id ? 'program-active-entry' : ''}>
                    <ProgramEntryCard entry={entry} onToggle={() => toggleEntry(entry.id)} onStart={() => startEntry(entry)} />
                    {activeEntry === entry.id && <div className="program-active-message"><CheckCircle2 size={15} /> الحصة مفتوحة. تواصل مع {entry.agent} عند بدء وقتها.</div>}
                  </div>
                )) : <div className="program-empty"><CalendarDays size={22} /><strong>لا توجد حصة في هذا اليوم.</strong><span>أضف موعدًا جديدًا ليبقى برنامجك محدثًا.</span></div>}
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="program-events-content">
              <div className="program-schedule-intro"><div><span className="program-card-kicker"><ClipboardPenLine size={14} /> ما يجب ألا يفوتك</span><h3>الاختبارات والمهام القادمة.</h3><p>أخبرني بمواعيدك، وسأربطها مع التمارين وبقية الوكلاء.</p></div><button type="button" className="program-inline-add" onClick={() => setShowAddForm(true)}><Plus size={15} /> إضافة موعد</button></div>
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
              <div className="program-notification-list"><div><Clock3 size={16} /><span><strong>قبل بداية الحصة</strong><small>تنبيه عند اقتراب موعد البداية</small></span><b>مفعّل</b></div><div><ClipboardPenLine size={16} /><span><strong>قبل الاختبار</strong><small>رفع كثافة التمارين قبل الموعد</small></span><b>مفعّل</b></div><div><Sparkles size={16} /><span><strong>بعد التأخر</strong><small>اقتراح حصة تعويضية في البرنامج</small></span><b>مفعّل</b></div></div>
            </div>
          )}
        </section>
      </div>

      {showAddForm && (
        <div className="program-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddForm(false); }}>
          <form className="program-add-modal" onSubmit={addEntry} onMouseDown={(event) => event.stopPropagation()} data-testid="form-add-program-event">
            <div className="program-modal-header"><div><span className="program-card-kicker"><Plus size={14} /> موعد جديد</span><h3>أضف شيئًا إلى برنامجك</h3></div><button type="button" className="program-modal-close" onClick={() => setShowAddForm(false)} aria-label="إغلاق"><X size={18} /></button></div>
            <label>اسم الموعد<input required value={newEntry.title} onChange={(event) => setNewEntry((current) => ({ ...current, title: event.target.value }))} placeholder="مثال: اختبار قوانين الحركة" autoFocus /></label>
            <div className="program-form-grid"><label>النوع<select value={newEntry.kind} onChange={(event) => setNewEntry((current) => ({ ...current, kind: event.target.value as ProgramKind }))}><option>اختبار</option><option>فرض</option><option>بحث</option><option>عطلة</option><option>مراجعة</option></select></label><label>المادة<select value={newEntry.subject} onChange={(event) => setNewEntry((current) => ({ ...current, subject: event.target.value }))}><option>الفيزياء</option><option>الرياضيات</option><option>العلوم الطبيعية</option><option>اللغة العربية</option></select></label></div>
            <div className="program-form-grid"><label>التاريخ<input type="date" value={newEntry.date} onChange={(event) => setNewEntry((current) => ({ ...current, date: event.target.value }))} /></label><label>وقت البداية<input type="time" value={newEntry.time} onChange={(event) => setNewEntry((current) => ({ ...current, time: event.target.value }))} /></label></div>
            <p className="program-modal-hint"><CalendarClock size={14} /> نحدد وقت البداية فقط، وتنتقل للخطوة التالية عندما تنتهي أنت.</p>
            <div className="program-modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAddForm(false)}>إلغاء</button><button type="submit" className="primary-button"><Plus size={16} /> إضافة إلى البرنامج</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
