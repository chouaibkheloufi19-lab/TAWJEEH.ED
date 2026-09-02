import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  Highlighter,
  ImagePlus,
  Lightbulb,
  MessageCircle,
  Pause,
  Play,
  Save,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';

type LessonConcept = {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  explanation: string;
  highlight: string;
  examples: Array<{ id: string; title: string; detail: string }>;
};

type Message = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

type LessonSession = {
  activeConcept: string;
  completedExamples: string[];
  note: string;
  attachment: string | null;
};

const lessonConcepts: LessonConcept[] = [
  {
    id: 'inertia',
    title: 'القصور الذاتي',
    subtitle: 'فهم الفكرة',
    duration: '٨ دقائق',
    explanation: 'الجسم يحافظ على حالته من السكون أو الحركة المنتظمة ما لم تؤثر فيه قوة محصلة.',
    highlight: 'يحافظ على حالته',
    examples: [
      { id: 'inertia-1', title: 'حددي معنى القصور الذاتي', detail: 'مقاومة الجسم لتغيير حالته الحركية.' },
      { id: 'inertia-2', title: 'اربطي الفكرة بالحافلة', detail: 'يميل جسم الراكب إلى الاستمرار في الحركة عند توقفها.' },
    ],
  },
  {
    id: 'force',
    title: 'القوة المحصلة',
    subtitle: 'بناء العلاقة',
    duration: '١٢ دقيقة',
    explanation: 'القوة المحصلة هي مجموع القوى المؤثرة، واتجاهها هو الذي يحدد تغير الحركة.',
    highlight: 'مجموع القوى المؤثرة',
    examples: [
      { id: 'force-1', title: 'اجمعي القوتين في الاتجاه نفسه', detail: 'قوتان متعاونتان تعطيان محصلة أكبر.' },
      { id: 'force-2', title: 'قارني قوتين متعاكستين', detail: 'نطرح الأصغر من الأكبر ونأخذ اتجاه الأكبر.' },
    ],
  },
  {
    id: 'newton',
    title: 'القانون الثاني لنيوتن',
    subtitle: 'تطبيق القانون',
    duration: '١٥ دقيقة',
    explanation: 'يتناسب التسارع طرديًا مع القوة المحصلة وعكسيًا مع الكتلة: F = m × a.',
    highlight: 'التسارع طرديًا مع القوة',
    examples: [
      { id: 'newton-1', title: 'اكتبي العلاقة الرمزية', detail: 'القوة المحصلة تساوي الكتلة مضروبة في التسارع.' },
      { id: 'newton-2', title: 'استخرجي التسارع', detail: 'نقسم القوة المحصلة على الكتلة.' },
    ],
  },
];

const sessionKey = 'tawjeeh.lesson.workspace.v1';

function readSession(): LessonSession {
  const fallback: LessonSession = {
    activeConcept: lessonConcepts[0].id,
    completedExamples: [],
    note: '',
    attachment: null,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(sessionKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LessonSession>;
    return {
      activeConcept: lessonConcepts.some((concept) => concept.id === parsed.activeConcept) ? parsed.activeConcept ?? fallback.activeConcept : fallback.activeConcept,
      completedExamples: Array.isArray(parsed.completedExamples) ? parsed.completedExamples.filter((id): id is string => typeof id === 'string') : [],
      note: typeof parsed.note === 'string' ? parsed.note : '',
      attachment: typeof parsed.attachment === 'string' ? parsed.attachment : null,
    };
  } catch {
    return fallback;
  }
}

function getTimeLabel() {
  return new Intl.DateTimeFormat('ar-DZ', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

export function LessonWorkspace() {
  const [session, setSession] = useState<LessonSession>(readSession);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', text: 'أهلًا، أنا فهيم. سنفكك هذا الدرس إلى خطوات صغيرة، ثم نثبت كل فكرة بمثال.' },
    { id: 'prompt', role: 'assistant', text: 'ابدئي من المسار أو اختاري جملة في اللوح تريدين أن نفهمها أكثر.' },
  ]);
  const [question, setQuestion] = useState('');
  const [highlightedPart, setHighlightedPart] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [narrationProgress, setNarrationProgress] = useState(0);
  const [noteStatus, setNoteStatus] = useState('محفوظ محليًا');
  const [attachmentError, setAttachmentError] = useState('');
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const activeConcept = useMemo(
    () => lessonConcepts.find((concept) => concept.id === session.activeConcept) ?? lessonConcepts[0],
    [session.activeConcept],
  );
  const completedCount = activeConcept.examples.filter((example) => session.completedExamples.includes(example.id)).length;
  const totalExamples = lessonConcepts.reduce((total, concept) => total + concept.examples.length, 0);
  const totalCompleted = lessonConcepts.reduce(
    (total, concept) => total + concept.examples.filter((example) => session.completedExamples.includes(example.id)).length,
    0,
  );

  useEffect(() => {
    window.localStorage.setItem(sessionKey, JSON.stringify(session));
    setNoteStatus('محفوظ محليًا');
  }, [session]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setNarrationProgress((progress) => {
        if (progress >= 100) {
          setIsPlaying(false);
          return 0;
        }
        return progress + 2;
      });
    }, 130);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    setNarrationProgress(0);
    setIsPlaying(false);
    setHighlightedPart('');
  }, [activeConcept.id]);

  const selectConcept = (concept: LessonConcept) => {
    if (concept.id === activeConcept.id) return;
    setSession((current) => ({ ...current, activeConcept: concept.id }));
    setMessages((current) => [
      ...current,
      { id: `concept-${concept.id}-${Date.now()}`, role: 'assistant', text: `انتقلنا إلى «${concept.title}». سأشرحها لك على اللوح، ثم نراجع أمثلتها معًا.` },
    ]);
  };

  const toggleExample = (exampleId: string) => {
    setSession((current) => ({
      ...current,
      completedExamples: current.completedExamples.includes(exampleId)
        ? current.completedExamples.filter((id) => id !== exampleId)
        : [...current.completedExamples, exampleId],
    }));
  };

  const askFahim = (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: cleanText },
      {
        id: `answer-${Date.now() + 1}`,
        role: 'assistant',
        text: highlightedPart
          ? `سؤالك عن «${highlightedPart}» مهم. تخيليها كحالة الجسم قبل أن تغيّر القوة مساره؛ راقبي ما الذي تغيّر وما الذي بقي ثابتًا.`
          : `لنربطها بمثال قريب: ${activeConcept.examples[0].detail} هل تريدين تجربة المثال التالي؟`,
      },
    ]);
    setQuestion('');
  };

  const handleQuestionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    askFahim(question);
  };

  const askAboutHighlight = () => {
    if (!highlightedPart) return;
    askFahim(`اشرح لي الجزء المحدد: ${highlightedPart}`);
  };

  const handleAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAttachmentError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAttachmentError('اختاري صورة بصيغة مناسبة.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAttachmentError('حجم الصورة يجب أن يكون أقل من ٥ ميغابايت.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSession((current) => ({ ...current, attachment: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const removeAttachment = () => setSession((current) => ({ ...current, attachment: null }));
  const isConceptDone = (concept: LessonConcept) => concept.examples.every((example) => session.completedExamples.includes(example.id));

  return (
    <section className="lesson-workspace" dir="rtl" data-testid="lesson-workspace">
      <header className="lesson-workspace-header">
        <div className="lesson-header-copy">
          <span className="lesson-kicker"><Sparkles size={13} /> جلسة مع فهيم · مرتبطة بالبرنامج</span>
          <h1>قوانين نيوتن والحركة</h1>
          <p>ثبّتي المكتسبات بهدوء. اختاري مفهومًا، اسألي فهيم، ثم اتركي أثرًا صغيرًا في مسارك.</p>
        </div>
        <div className="lesson-header-status" role="status" data-testid="status-lesson-progress">
          <span className="lesson-status-dot" aria-hidden="true" />
          <span>{totalCompleted} من {totalExamples} أمثلة مكتملة</span>
        </div>
      </header>

      <div className="lesson-grid">
        <aside className="lesson-panel lesson-path-panel" aria-label="مسار إتقان الدرس">
          <div className="lesson-panel-heading">
            <div>
              <span className="lesson-panel-kicker"><BookOpen size={13} /> المسار</span>
              <h2>طريق الإتقان</h2>
              <p>ثلاث محطات، خطوة واحدة الآن.</p>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <div className="lesson-progress-meter">
            <div className="lesson-progress-label"><span>تقدم الجلسة</span><strong>{Math.round((totalCompleted / totalExamples) * 100)}٪</strong></div>
            <div className="lesson-progress-track" aria-label="نسبة التقدم"><span style={{ width: `${(totalCompleted / totalExamples) * 100}%` }} /></div>
          </div>
          <div className="lesson-path-list">
            {lessonConcepts.map((concept, index) => {
              const active = concept.id === activeConcept.id;
              const done = isConceptDone(concept);
              return (
                <button
                  key={concept.id}
                  type="button"
                  className={`lesson-path-item ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                  onClick={() => selectConcept(concept)}
                  aria-current={active ? 'step' : undefined}
                  data-testid={`button-lesson-concept-${concept.id}`}
                >
                  <span className="lesson-path-node">{done ? <Check size={15} /> : `٠${index + 1}`}</span>
                  <span><strong>{concept.title}</strong><small>{active ? 'تعملين عليها الآن' : concept.subtitle}</small></span>
                </button>
              );
            })}
          </div>
          <div className="lesson-path-note"><Lightbulb size={15} /><span>فَهيم يتابع انتقالك من الفكرة إلى التطبيق، ولا يطلب منك أكثر من خطوة واحدة.</span></div>
        </aside>

        <section className="lesson-panel lesson-conversation-panel" aria-label="محادثة فهيم">
          <div className="lesson-panel-heading lesson-conversation-heading">
            <div className="lesson-fahim-chip">
              <span className="lesson-fahim-avatar"><img src={owlLogoPath} alt="فهيم، وكيل تثبيت المفاهيم" /></span>
              <span><strong>فَهيم</strong><small>متصل بوكيل البرنامج</small></span>
            </div>
            <MessageCircle size={20} />
          </div>
          <div className="lesson-messages" aria-live="polite" data-testid="region-fahim-messages">
            {messages.map((message) => (
              <article key={message.id} className={`lesson-message ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`} data-testid={`message-lesson-${message.id}`}>
                <div className="lesson-message-meta">
                  {message.role === 'assistant' ? <><Sparkles size={11} /> فهيم</> : 'أنت'}
                  <span className="lesson-message-time">{getTimeLabel()}</span>
                </div>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
          <form className="lesson-composer" onSubmit={handleQuestionSubmit}>
            <label className="lesson-composer-label" htmlFor="lesson-question"><span>اسألي فهيم عن الخطوة التالية</span><span>أو أرفقي حلك</span></label>
            <div className="lesson-composer-box">
              <textarea id="lesson-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="مثال: لماذا يستمر الراكب في الحركة؟" rows={2} data-testid="input-lesson-question" />
              <button type="button" className="lesson-icon-button" onClick={() => attachmentInputRef.current?.click()} aria-label="إرفاق صورة handwritten" data-testid="button-attach-handwritten"><ImagePlus size={17} /></button>
              <button type="submit" className="lesson-send-button" aria-label="إرسال السؤال إلى فهيم" data-testid="button-send-lesson-question"><Send size={16} /></button>
            </div>
            <input ref={attachmentInputRef} type="file" accept="image/*" onChange={handleAttachment} hidden data-testid="input-handwritten-image" />
            {session.attachment && (
              <div className="lesson-attachment" data-testid="status-handwritten-attached">
                <img src={session.attachment} alt="معاينة الحل المكتوب بخط اليد" />
                <span>تم إرفاق الحل المكتوب بخط اليد</span>
                <button type="button" onClick={removeAttachment} aria-label="حذف الصورة المرفقة" data-testid="button-remove-handwritten"><X size={14} /></button>
              </div>
            )}
            {attachmentError && <p className="lesson-field-error" role="alert" data-testid="status-attachment-error">{attachmentError}</p>}
          </form>
        </section>

        <section className="lesson-panel lesson-board-panel" aria-label="لوح شرح الدرس">
          <div className="lesson-board-card">
            <div className="lesson-board-top">
              <div className="lesson-board-title">
                <span className="lesson-panel-kicker"><Volume2 size={13} /> يشرح الآن</span>
                <h2>{activeConcept.title}</h2>
                <p>{activeConcept.duration} · المحطة {lessonConcepts.indexOf(activeConcept) + 1} من {lessonConcepts.length}</p>
              </div>
              <div className="lesson-board-owl"><img src={owlLogoPath} alt="بومة فهيم تشرح المفهوم الحالي" /></div>
            </div>
            <div className="lesson-board-body">
              <p>الفكرة الأساسية: <button type="button" className={`lesson-highlight-part ${highlightedPart === activeConcept.highlight ? 'is-selected' : ''}`} onClick={() => setHighlightedPart(activeConcept.highlight)} aria-pressed={highlightedPart === activeConcept.highlight} data-testid="button-highlight-concept">{activeConcept.highlight}</button> {activeConcept.explanation.replace(`${activeConcept.highlight} `, '')}</p>
              <button type="button" className="lesson-ask-highlight" onClick={askAboutHighlight} disabled={!highlightedPart} data-testid="button-ask-highlighted"><Highlighter size={13} /> اسألي عن الجزء المحدد</button>
              <div className="lesson-board-divider" />
              <div className="lesson-narration" role="status" aria-live="polite">
                <button type="button" className="lesson-play-button" onClick={() => setIsPlaying((playing) => !playing)} aria-label={isPlaying ? 'إيقاف شرح فهيم' : 'تشغيل شرح فهيم'} data-testid="button-toggle-narration">
                  {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <div className="lesson-narration-copy">
                  <strong>{isPlaying ? 'فهيم يشرح لك...' : 'شرح فهيم جاهز'}</strong>
                  <span>{isPlaying ? activeConcept.explanation : 'استمعي للفكرة الأساسية أو اقرئيها على اللوح.'}</span>
                  <div className="lesson-narration-progress"><span style={{ width: `${narrationProgress}%` }} /></div>
                </div>
              </div>
            </div>
            <div className="lesson-board-footer"><span><CircleHelp size={14} /> اضغطي على الجملة المظللة لتحديدها</span><span>{completedCount}/{activeConcept.examples.length} مكتمل</span></div>
          </div>

          <div className="lesson-examples">
            <div className="lesson-examples-heading"><h3>أمثلة التثبيت</h3><span>{completedCount} / {activeConcept.examples.length}</span></div>
            <div className="lesson-example-list">
              {activeConcept.examples.map((example) => {
                const done = session.completedExamples.includes(example.id);
                return (
                  <button key={example.id} type="button" className={`lesson-example ${done ? 'is-done' : ''}`} onClick={() => toggleExample(example.id)} aria-pressed={done} data-testid={`button-complete-example-${example.id}`}>
                    <span className="lesson-example-check">{done && <Check size={13} />}</span>
                    <span className="lesson-example-copy"><strong>{example.title}</strong><small>{example.detail}</small></span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lesson-note-card">
            <div className="lesson-note-header">
              <strong><Save size={13} /> ملاحظتك لهذه الجلسة</strong>
              <span>{noteStatus}</span>
            </div>
            <textarea value={session.note} onChange={(event) => { setNoteStatus('يُحفظ الآن'); setSession((current) => ({ ...current, note: event.target.value })); }} placeholder="اكتبي كلمة أو علاقة تريدين تذكرها..." aria-label="ملاحظة الدرس" data-testid="input-lesson-note" />
            <button type="button" className="lesson-save-note" onClick={() => { window.localStorage.setItem(sessionKey, JSON.stringify(session)); setNoteStatus('حُفظت الملاحظة'); }} data-testid="button-save-lesson-note"><Save size={12} /> حفظ الملاحظة</button>
            {session.attachment && <div className="lesson-saved-image"><img src={session.attachment} alt="الحل المرفق محفوظ محليًا" /><span>الصورة محفوظة مع الجلسة</span></div>}
          </div>
        </section>
      </div>
    </section>
  );
}
