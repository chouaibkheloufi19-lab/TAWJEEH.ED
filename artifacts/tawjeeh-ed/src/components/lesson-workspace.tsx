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
import owlThinkingPose from '@assets/owl-thinking-pose.png';
import owlMistakePose from '@assets/owl-mistake-pose.png';
import owlSuccessPose from '@assets/owl-success-pose.png';
import owlFailurePose from '@assets/owl-failure-pose.png';

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

type AttemptAnalysis = {
  firstError: string;
  firstErrorStep: string;
  lastCorrectStep: string;
  feedback: string;
  nextExercise: string;
  summaryAnchor: string;
};

type AttemptBankItem = AttemptAnalysis & {
  id: string;
  fileName: string;
  createdAt: string;
};

type LessonSession = {
  activeConcept: string;
  completedExamples: string[];
  note: string;
  attachment: string | null;
  attachmentName: string | null;
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
const attemptBankKey = 'tawjeeh.attempt.bank.v1';

function readSession(): LessonSession {
  const fallback: LessonSession = {
    activeConcept: lessonConcepts[0].id,
    completedExamples: [],
    note: '',
    attachment: null,
    attachmentName: null,
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
      attachmentName: typeof parsed.attachmentName === 'string' ? parsed.attachmentName : null,
    };
  } catch {
    return fallback;
  }
}

function readAttemptBank(): AttemptBankItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(attemptBankKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
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
  const [isThinking, setIsThinking] = useState(false);
  const [analysis, setAnalysis] = useState<AttemptAnalysis | null>(null);
  const [analysisState, setAnalysisState] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [attemptBank, setAttemptBank] = useState<AttemptBankItem[]>(readAttemptBank);
  const [generatedExercise, setGeneratedExercise] = useState('');
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
    window.localStorage.setItem(attemptBankKey, JSON.stringify(attemptBank));
  }, [attemptBank]);

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

  const askFahim = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    const userId = `user-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', text: cleanText },
    ]);
    setQuestion('');
    setIsThinking(true);
    try {
      const response = await fetch('/api/fahim/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: cleanText,
          lesson: 'قوانين نيوتن والحركة',
          concept: activeConcept.title,
          context: analysis ? `${analysis.lastCorrectStep} — ${analysis.firstError}` : highlightedPart,
        }),
      });
      const payload = (await response.json()) as { answer?: string; message?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.message || 'تعذر رد فهيم');
      setMessages((current) => [...current, { id: `answer-${Date.now()}`, role: 'assistant', text: payload.answer as string }]);
    } catch {
      setMessages((current) => [
        ...current,
        { id: `answer-error-${Date.now()}`, role: 'assistant', text: 'تعذر الوصول إلى فهيم الآن. لم أفقد سؤالك؛ حاولي الإرسال مرة أخرى بعد لحظات.' },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleQuestionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    askFahim(question);
  };

  const askAboutHighlight = () => {
    if (!highlightedPart) return;
    askFahim(`اشرح لي الجزء المحدد: ${highlightedPart}`);
  };

  const analyzeAttempt = async (imageDataUrl: string, fileName: string) => {
    setAnalysis(null);
    setAnalysisError('');
    setAnalysisState('analyzing');
    try {
      const response = await fetch('/api/fahim/analyze-attempt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          lesson: 'قوانين نيوتن والحركة',
          concept: activeConcept.title,
        }),
      });
      const payload = (await response.json()) as Partial<AttemptAnalysis> & { message?: string };
      if (!response.ok || !payload.firstError || !payload.lastCorrectStep) {
        throw new Error(payload.message || 'تعذر تحليل المحاولة');
      }
      const nextAnalysis = payload as AttemptAnalysis;
      setAnalysis(nextAnalysis);
      setAnalysisState('ready');
      setAttemptBank((current) => [
        { ...nextAnalysis, id: `attempt-${Date.now()}`, fileName, createdAt: getTimeLabel() },
        ...current,
      ].slice(0, 8));
      setMessages((current) => [
        ...current,
        {
          id: `analysis-${Date.now()}`,
          role: 'assistant',
          text: `قرأت محاولتك. توقفت عند «${nextAnalysis.firstErrorStep}»، وسنعود إلى «${nextAnalysis.lastCorrectStep}» قبل أن نبني تمرينًا مشابهًا.`,
        },
      ]);
    } catch (error) {
      setAnalysisState('error');
      setAnalysisError(error instanceof Error ? error.message : 'تعذر تحليل الصورة');
    }
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
        setSession((current) => ({ ...current, attachment: reader.result as string, attachmentName: file.name }));
        void analyzeAttempt(reader.result as string, file.name);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const removeAttachment = () => {
    setSession((current) => ({ ...current, attachment: null, attachmentName: null }));
    setAnalysis(null);
    setAnalysisState('idle');
    setAnalysisError('');
  };
  const resetToLastCorrect = () => {
    if (!analysis) return;
    setSession((current) => ({
      ...current,
      completedExamples: current.completedExamples.filter((id) => !id.startsWith(`${activeConcept.id}-`)),
    }));
    setGeneratedExercise('');
    setMessages((current) => [
      ...current,
      { id: `recovery-${Date.now()}`, role: 'assistant', text: `ثبتنا آخر خطوة صحيحة: «${analysis.lastCorrectStep}». أعدنا هذا المفهوم إلى ما قبل الخطأ حتى نبنيه من جديد.` },
    ]);
  };
  const buildExercise = () => {
    if (!analysis) return;
    setGeneratedExercise(analysis.nextExercise);
    setMessages((current) => [
      ...current,
      { id: `exercise-${Date.now()}`, role: 'assistant', text: 'بنيت لك تمرينًا جديدًا على نفس موضع الخطأ. حاولي كتابة أول خطوة فقط ثم أرسليها لي.' },
    ]);
  };
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
               <span className="lesson-fahim-avatar"><img src={isThinking ? owlThinkingPose : analysisState === 'error' ? owlFailurePose : owlLogoPath} alt="فهيم، وكيل تثبيت المفاهيم" /></span>
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
              <button type="submit" className="lesson-send-button" aria-label="إرسال السؤال إلى فهيم" disabled={!question.trim() || isThinking} data-testid="button-send-lesson-question"><Send size={16} /></button>
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
            {isThinking && <p className="lesson-thinking" role="status">فهيم يراجع سؤالك...</p>}
            {analysisState === 'analyzing' && <p className="lesson-thinking" role="status" data-testid="status-attempt-analysis">فهيم يقرأ المحاولة ويبحث عن أول خطأ...</p>}
            {analysisState === 'error' && <div className="lesson-analysis-error" role="alert" data-testid="status-attempt-analysis-error"><span>{analysisError}</span><button type="button" onClick={() => { if (session.attachment) void analyzeAttempt(session.attachment, session.attachmentName ?? 'محاولة'); }}>إعادة التحليل</button></div>}
            {analysis && (
              <div className="lesson-analysis-card" data-testid="card-attempt-analysis">
                <div className="lesson-analysis-header"><strong>قراءة فهيم للمحاولة</strong><span>حُفظت في بنك الأخطاء</span></div>
                <div className="lesson-analysis-row is-correct"><span>آخر خطوة صحيحة</span><strong>{analysis.lastCorrectStep}</strong></div>
                <div className="lesson-analysis-row is-error"><span>بداية الخطأ</span><strong>{analysis.firstErrorStep}</strong></div>
                <p>{analysis.feedback}</p>
                <div className="lesson-analysis-actions"><button type="button" onClick={resetToLastCorrect} data-testid="button-reset-to-last-correct">العودة لآخر خطوة صحيحة</button><button type="button" onClick={buildExercise} data-testid="button-generate-error-exercise">ابنِ تمرينًا مشابهًا</button></div>
              </div>
            )}
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
               <div className="lesson-board-owl"><img src={analysis ? owlMistakePose : isConceptDone(activeConcept) ? owlSuccessPose : owlLogoPath} alt="بومة فهيم تشرح المفهوم الحالي" /></div>
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
            {generatedExercise && <div className="lesson-generated-exercise" data-testid="card-generated-error-exercise"><span>تمرين يعالج نفس الخطأ</span><p>{generatedExercise}</p></div>}
          </div>

          <div className="lesson-note-card">
            <div className="lesson-note-header">
              <strong><Save size={13} /> ملاحظتك لهذه الجلسة</strong>
              <span>{noteStatus}</span>
            </div>
            <textarea value={session.note} onChange={(event) => { setNoteStatus('يُحفظ الآن'); setSession((current) => ({ ...current, note: event.target.value })); }} placeholder="اكتبي كلمة أو علاقة تريدين تذكرها..." aria-label="ملاحظة الدرس" data-testid="input-lesson-note" />
            <button type="button" className="lesson-save-note" onClick={() => { window.localStorage.setItem(sessionKey, JSON.stringify(session)); setNoteStatus('حُفظت الملاحظة'); }} data-testid="button-save-lesson-note"><Save size={12} /> حفظ الملاحظة</button>
            {session.attachment && <div className="lesson-saved-image"><img src={session.attachment} alt="الحل المرفق محفوظ محليًا" /><span>الصورة محفوظة مع الجلسة</span></div>}
            {attemptBank.length > 0 && <div className="lesson-bank"><div className="lesson-bank-heading"><strong>بنك الأخطاء</strong><span>{attemptBank.length} محاولات محللة</span></div>{attemptBank.slice(0, 3).map((item) => <button type="button" key={item.id} className="lesson-bank-item" onClick={() => { setAnalysis(item); setAnalysisState('ready'); }}><span>{item.fileName}</span><small>{item.createdAt} · {item.summaryAnchor}</small></button>)}</div>}
          </div>
        </section>
      </div>
    </section>
  );
}
