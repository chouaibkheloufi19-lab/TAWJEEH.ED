import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  Eraser,
  Highlighter,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  getListKnowledgeQueryKey,
  useListKnowledge,
  type KnowledgeCard,
} from '@workspace/api-client-react';
import owlAgentGold from '@assets/owl-agent-fahim-gold_1788382004394.png';
import owlAgentMint from '@assets/owl-agent-fahim-mint_1788382004392.png';
import owlAgentTeal from '@assets/owl-agent-fahim-teal_1788382004393.png';
import owlAgentViolet from '@assets/owl-agent-fahim-violet_1788382004393.png';

type LessonSectionId = 'definition' | 'worked-example' | 'graph' | 'practice' | 'recap';
type BoardMode = 'pen' | 'highlight';
type Point = { x: number; y: number };

type LessonSection = {
  id: LessonSectionId;
  label: string;
  shortLabel: string;
  duration: string;
  title: string;
  explanation: string;
  highlight: string;
  prompt: string;
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
  activeConcept: LessonSectionId;
  completedExamples: string[];
  note: string;
  attachment: string | null;
  attachmentName: string | null;
  whiteboardStrokes: Point[][];
};

const lessonSections: LessonSection[] = [
  {
    id: 'definition',
    label: 'التعريف',
    shortLabel: 'فكرة الدرس',
    duration: '٣ دقائق',
    title: 'ما الذي يغيّر الحركة؟',
    explanation: 'الجسم يحافظ على حالته من السكون أو الحركة المنتظمة ما لم تؤثر فيه قوة محصلة.',
    highlight: 'يحافظ على حالته',
    prompt: 'ابدئي بتحديد معنى القصور الذاتي بكلماتك.',
  },
  {
    id: 'worked-example',
    label: 'مثال محلول',
    shortLabel: 'نطبّق الفكرة',
    duration: '٨ دقائق',
    title: 'مثال من الحافلة',
    explanation: 'عند توقف الحافلة فجأة يستمر جسم الراكب في الحركة إلى الأمام، لأن حالته الحركية لم تتغير لحظيًا.',
    highlight: 'يستمر جسم الراكب في الحركة',
    prompt: 'تتبعي الخطوة الأولى في المثال قبل كتابة العلاقة.',
  },
  {
    id: 'graph',
    label: 'تمثيل بياني',
    shortLabel: 'نرى العلاقة',
    duration: '٦ دقائق',
    title: 'الحركة على الرسم',
    explanation: 'يمثل ميل منحنى الموضع بدلالة الزمن السرعة، بينما يكشف تغير الميل عن تغير الحركة.',
    highlight: 'ميل منحنى الموضع',
    prompt: 'اختاري نقطة على المنحنى واسألي: ماذا يخبرنا الميل هنا؟',
  },
  {
    id: 'practice',
    label: 'تدريب',
    shortLabel: 'أجربي بنفسك',
    duration: '١٠ دقائق',
    title: 'قوة محصلة، خطوة خطوة',
    explanation: 'القوة المحصلة هي مجموع القوى المؤثرة، واتجاهها هو الذي يحدد تغير الحركة.',
    highlight: 'مجموع القوى المؤثرة',
    prompt: 'اكتبي القوى المعطاة واتجاه كل قوة قبل الحساب.',
  },
  {
    id: 'recap',
    label: 'خلاصة',
    shortLabel: 'نثبت المكتسب',
    duration: '٤ دقائق',
    title: 'القانون الثاني لنيوتن',
    explanation: 'يتناسب التسارع طرديًا مع القوة المحصلة وعكسيًا مع الكتلة: F = m × a.',
    highlight: 'التسارع طرديًا مع القوة',
    prompt: 'لخّصي العلاقة في سطر واحد، ثم قارنيها بما كتبتِه في ملاحظتك.',
  },
];

const exampleDetails: Record<LessonSectionId, { id: string; title: string; detail: string }[]> = {
  definition: [
    { id: 'definition-1', title: 'عرّفي القصور الذاتي', detail: 'مقاومة الجسم لتغيير حالته الحركية.' },
    { id: 'definition-2', title: 'اربطيه بالحياة اليومية', detail: 'جسم الراكب يميل إلى الاستمرار في الحركة.' },
  ],
  'worked-example': [
    { id: 'worked-example-1', title: 'حددي الحالة قبل التوقف', detail: 'الراكب والحافلة يتحركان في الاتجاه نفسه.' },
    { id: 'worked-example-2', title: 'فسّري اتجاه الميل', detail: 'يحافظ الجسم على الحركة إلى الأمام.' },
  ],
  graph: [
    { id: 'graph-1', title: 'اقرئي الميل', detail: 'الميل الأكبر يعني سرعة أكبر في الاتجاه نفسه.' },
    { id: 'graph-2', title: 'قارني مقطعين', detail: 'تغير الميل يدل على تغير السرعة.' },
  ],
  practice: [
    { id: 'practice-1', title: 'اكتبي المعطيات', detail: 'رتبي القوة والكتلة والاتجاه قبل التعويض.' },
    { id: 'practice-2', title: 'احسبي التسارع', detail: 'نقسم القوة المحصلة على الكتلة.' },
  ],
  recap: [
    { id: 'recap-1', title: 'اكتبي العلاقة الرمزية', detail: 'القوة المحصلة تساوي الكتلة مضروبة في التسارع.' },
    { id: 'recap-2', title: 'استخرجي المجهول', detail: 'اختاري العملية العكسية المناسبة للمعطى.' },
  ],
};

const sessionKey = 'tawjeeh.lesson.workspace.v1';
const attemptBankKey = 'tawjeeh.attempt.bank.v1';

function readSession(): LessonSession {
  const fallback: LessonSession = {
    activeConcept: 'definition',
    completedExamples: [],
    note: '',
    attachment: null,
    attachmentName: null,
    whiteboardStrokes: [],
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(sessionKey) || '{}') as Partial<LessonSession>;
    const active = lessonSections.some((section) => section.id === parsed.activeConcept)
      ? parsed.activeConcept as LessonSectionId
      : fallback.activeConcept;
    return {
      activeConcept: active,
      completedExamples: Array.isArray(parsed.completedExamples) ? parsed.completedExamples.filter((id): id is string => typeof id === 'string') : [],
      note: typeof parsed.note === 'string' ? parsed.note : '',
      attachment: typeof parsed.attachment === 'string' ? parsed.attachment : null,
      attachmentName: typeof parsed.attachmentName === 'string' ? parsed.attachmentName : null,
      whiteboardStrokes: Array.isArray(parsed.whiteboardStrokes)
        ? parsed.whiteboardStrokes.filter((stroke): stroke is Point[] => Array.isArray(stroke) && stroke.every((point) => typeof point?.x === 'number' && typeof point?.y === 'number'))
        : [],
    };
  } catch {
    return fallback;
  }
}

function readAttemptBank(): AttemptBankItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(attemptBankKey) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 8) as AttemptBankItem[] : [];
  } catch {
    return [];
  }
}

function getTimeLabel() {
  return new Intl.DateTimeFormat('ar-DZ', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function sourceForSection(section: LessonSection, cards: KnowledgeCard[]) {
  const terms: Record<LessonSectionId, string[]> = {
    definition: ['تعريف', 'مفهوم', 'definition'],
    'worked-example': ['مثال', 'تطبيق', 'example'],
    graph: ['بياني', 'تمثيل', 'graph'],
    practice: ['تمرين', 'تدريب', 'practice'],
    recap: ['ملخص', 'خلاصة', 'recap'],
  };
  return cards.find((card) => terms[section.id].some((term) => `${card.title} ${card.type} ${card.tags?.join(' ')}`.toLowerCase().includes(term.toLowerCase())))
    ?? cards.find((card) => card.lesson?.includes('نيوتن') || card.title?.includes('نيوتن'));
}

function drawBoard(ctx: CanvasRenderingContext2D, width: number, height: number, sectionId: LessonSectionId, strokes: Point[][], mode: BoardMode, highlightedPart: string) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fbfaf5';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(54, 103, 104, .08)';
  ctx.lineWidth = 1;
  for (let x = 20; x < width; x += 28) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 20; y < height; y += 28) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  if (sectionId === 'graph' || sectionId === 'recap' || highlightedPart) {
    const left = width * .16;
    const bottom = height * .78;
    const right = width * .84;
    const top = height * .2;
    ctx.strokeStyle = '#587b7a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(left, top); ctx.stroke();
    ctx.fillStyle = '#587b7a';
    ctx.font = '600 12px IBM Plex Sans Arabic, sans-serif';
    ctx.fillText('الزمن', right - 32, bottom + 25);
    ctx.fillText('الموضع', left + 8, top - 9);
    ctx.strokeStyle = '#2e8b7b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left + 8, bottom - 10);
    ctx.bezierCurveTo(width * .34, height * .67, width * .48, height * .56, width * .63, height * .43);
    ctx.bezierCurveTo(width * .71, height * .36, width * .77, height * .29, right - 3, top + 8);
    ctx.stroke();
    ctx.fillStyle = '#2e8b7b';
    ctx.beginPath(); ctx.arc(width * .63, height * .43, 5, 0, Math.PI * 2); ctx.fill();
  }
  strokes.forEach((stroke) => {
    if (stroke.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * width, stroke[0].y * height);
    stroke.slice(1).forEach((point) => ctx.lineTo(point.x * width, point.y * height));
    ctx.strokeStyle = mode === 'highlight' ? 'rgba(220, 169, 64, .72)' : '#315c66';
    ctx.lineWidth = mode === 'highlight' ? 11 : 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  });
}

export function LessonWorkspace() {
  const [session, setSession] = useState<LessonSession>(readSession);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', text: 'أهلًا، أنا فهيم. سنمشي في العناصر الخمسة بهدوء، ونثبت كل فكرة بخطوة صغيرة.' },
    { id: 'prompt', role: 'assistant', text: 'اختاري عنصرًا من المسار، أو اكتبي سؤالك، أو ارفقي صورة محاولتك.' },
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
  const [boardMode, setBoardMode] = useState<BoardMode>('pen');
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<Point[]>([]);
  const knowledgeParams = useMemo(() => ({ subject: 'العلوم الفيزيائية', curriculum_year: '3AS' }), []);
  const knowledgeQuery = useListKnowledge(knowledgeParams, { query: { queryKey: getListKnowledgeQueryKey(knowledgeParams), staleTime: 5 * 60 * 1000 } });
  const knowledgeCards = useMemo(() => (knowledgeQuery.data as KnowledgeCard[] | undefined) ?? [], [knowledgeQuery.data]);
  const activeSection = useMemo(() => lessonSections.find((section) => section.id === session.activeConcept) ?? lessonSections[0], [session.activeConcept]);
  const activeSource = useMemo(() => sourceForSection(activeSection, knowledgeCards), [activeSection, knowledgeCards]);
  const activeExamples = exampleDetails[activeSection.id];
  const completedCount = activeExamples.filter((example) => session.completedExamples.includes(example.id)).length;
  const totalExamples = lessonSections.reduce((total, section) => total + exampleDetails[section.id].length, 0);
  const totalCompleted = lessonSections.reduce((total, section) => total + exampleDetails[section.id].filter((example) => session.completedExamples.includes(example.id)).length, 0);
  const progress = Math.round((totalCompleted / totalExamples) * 100);

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
      setNarrationProgress((value) => {
        if (value >= 100) { setIsPlaying(false); return 0; }
        return value + 2;
      });
    }, 130);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    setNarrationProgress(0);
    setIsPlaying(false);
    setHighlightedPart('');
  }, [activeSection.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    drawBoard(context, rect.width, rect.height, activeSection.id, session.whiteboardStrokes, boardMode, highlightedPart);
  }, [activeSection.id, boardMode, highlightedPart, session.whiteboardStrokes]);

  const selectSection = (section: LessonSection) => {
    if (section.id === activeSection.id) return;
    setSession((current) => ({ ...current, activeConcept: section.id }));
    setMessages((current) => [...current, { id: `section-${section.id}-${Date.now()}`, role: 'assistant', text: `انتقلنا إلى «${section.label}». ${section.prompt}` }]);
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
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text: cleanText }]);
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
          concept: activeSection.title,
          context: analysis ? `${analysis.lastCorrectStep} — ${analysis.firstError}` : highlightedPart || activeSection.explanation,
        }),
      });
      const payload = await response.json() as { answer?: string; message?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.message || 'تعذر رد فهيم');
      setMessages((current) => [...current, { id: `answer-${Date.now()}`, role: 'assistant', text: payload.answer as string }]);
    } catch {
      setMessages((current) => [...current, { id: `answer-error-${Date.now()}`, role: 'assistant', text: 'تعذر الوصول إلى فهيم الآن. احتفظت بسؤالك؛ حاولي الإرسال مرة أخرى بعد لحظات.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleQuestionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void askFahim(question);
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
        body: JSON.stringify({ imageDataUrl, lesson: 'قوانين نيوتن والحركة', concept: activeSection.title }),
      });
      const payload = await response.json() as Partial<AttemptAnalysis> & { message?: string };
      if (!response.ok || !payload.firstError || !payload.lastCorrectStep) throw new Error(payload.message || 'تعذر تحليل المحاولة');
      const nextAnalysis = payload as AttemptAnalysis;
      setAnalysis(nextAnalysis);
      setAnalysisState('ready');
      setAttemptBank((current) => [{ ...nextAnalysis, id: `attempt-${Date.now()}`, fileName, createdAt: getTimeLabel() }, ...current].slice(0, 8));
      setMessages((current) => [...current, { id: `analysis-${Date.now()}`, role: 'assistant', text: `قرأت محاولتك. توقفت عند «${nextAnalysis.firstErrorStep}»، وسنعود إلى «${nextAnalysis.lastCorrectStep}» قبل أن نبني تمرينًا مشابهًا.` }]);
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
    setSession((current) => ({ ...current, completedExamples: current.completedExamples.filter((id) => !id.startsWith(`${activeSection.id}-`)) }));
    setGeneratedExercise('');
    setMessages((current) => [...current, { id: `recovery-${Date.now()}`, role: 'assistant', text: `ثبتنا آخر خطوة صحيحة: «${analysis.lastCorrectStep}». سنبني هذا المفهوم من جديد.` }]);
  };

  const buildExercise = () => {
    if (!analysis) return;
    setGeneratedExercise(analysis.nextExercise);
    setMessages((current) => [...current, { id: `exercise-${Date.now()}`, role: 'assistant', text: 'بنيت لك تمرينًا على نفس موضع الخطأ. اكتبي أول خطوة فقط ثم أرسليها لي.' }]);
  };

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = [getCanvasPoint(event)];
  };

  const continueDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current.length) return;
    drawingRef.current = [...drawingRef.current, getCanvasPoint(event)];
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    drawBoard(context, rect.width, rect.height, activeSection.id, [...session.whiteboardStrokes, drawingRef.current], boardMode, highlightedPart);
  };

  const finishDrawing = () => {
    if (!drawingRef.current.length) return;
    setSession((current) => ({ ...current, whiteboardStrokes: [...current.whiteboardStrokes, drawingRef.current] }));
    drawingRef.current = [];
  };

  const clearBoard = () => setSession((current) => ({ ...current, whiteboardStrokes: [] }));

  return (
    <section className="lesson-workspace" dir="rtl" data-testid="lesson-workspace">
      <header className="lesson-workspace-header">
        <div className="lesson-title-block">
          <span className="lesson-kicker"><Sparkles size={13} /> جلسة تثبيت · علوم فيزيائية</span>
          <h1>قوانين نيوتن والحركة</h1>
          <p>ثلاث نوافذ فقط: مسار واضح، تفاعل فعلي، وشرح على اللوح.</p>
        </div>
        <div className="lesson-header-status" role="status" data-testid="status-lesson-progress">
          <span className="lesson-status-dot" aria-hidden="true" />
          <span>{totalCompleted} من {totalExamples} خطوات مكتملة</span>
          <strong>{progress}٪</strong>
        </div>
      </header>

      <div className="lesson-grid">
        <aside className="lesson-panel lesson-path-panel" aria-label="مسار عناصر الدرس">
          <div className="lesson-panel-heading">
            <div>
              <span className="lesson-panel-kicker"><BookOpen size={13} /> المسار الأول</span>
              <h2>عناصر الدرس</h2>
              <p>اختاري موضعك، والباقي يبقى هادئًا.</p>
            </div>
            <span className="lesson-rail-count">{progress}٪</span>
          </div>
          <div className="lesson-progress-meter">
            <div className="lesson-progress-label"><span>تقدم الجلسة</span><strong>{totalCompleted}/{totalExamples}</strong></div>
            <div className="lesson-progress-track" aria-label="نسبة التقدم"><span style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="lesson-path-list">
            {lessonSections.map((section, index) => {
              const active = section.id === activeSection.id;
              const done = exampleDetails[section.id].every((example) => session.completedExamples.includes(example.id));
              const source = sourceForSection(section, knowledgeCards);
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`lesson-path-item ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                  onClick={() => selectSection(section)}
                  aria-current={active ? 'step' : undefined}
                  data-testid={`button-lesson-section-${section.id}`}
                >
                  <span className="lesson-path-node">{done ? <Check size={15} /> : `٠${index + 1}`}</span>
                  <span className="lesson-path-copy"><strong>{section.label}</strong><small>{active ? section.title : section.shortLabel}</small>{source && <em>من {source.source}</em>}</span>
                  {active && <span className="lesson-path-current" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className="lesson-path-note"><Lightbulb size={15} /><span>المحتوى مرتبط ببطاقات المعرفة المصدرية، وتظهر الإحالة عند توفرها.</span></div>
          {knowledgeQuery.isLoading && <p className="lesson-source-status"><LoaderCircle size={13} /> نتحقق من مصادر الدرس...</p>}
          {knowledgeQuery.isError && <p className="lesson-source-status is-error">تعذر تحميل الإحالات؛ بقيت أدوات الجلسة متاحة.</p>}
        </aside>

        <section className="lesson-panel lesson-conversation-panel" aria-label="منطقة تفاعل الطالب">
          <div className="lesson-panel-heading lesson-conversation-heading">
            <div className="lesson-fahim-chip">
              <span className="lesson-fahim-avatar"><img src={isThinking ? owlAgentViolet : analysisState === 'error' ? owlAgentGold : owlAgentTeal} alt="فهيم، مساعد تثبيت المفاهيم" /></span>
              <span><strong>فهيم</strong><small>تفاعل الطالب</small></span>
            </div>
            <span className={`lesson-live-state ${isThinking || analysisState === 'analyzing' ? 'is-working' : ''}`}><i />{analysisState === 'analyzing' ? 'يحلل الصورة' : isThinking ? 'يكتب الآن' : 'جاهز'}</span>
          </div>
          <div className="lesson-messages" aria-live="polite" data-testid="region-fahim-messages">
            {messages.map((message) => (
              <article key={message.id} className={`lesson-message ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`} data-testid={`message-lesson-${message.id}`}>
                <div className="lesson-message-meta">{message.role === 'assistant' ? <><Sparkles size={11} /> فهيم</> : 'أنت'}<span className="lesson-message-time">{getTimeLabel()}</span></div>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
          <form className="lesson-composer" onSubmit={handleQuestionSubmit}>
            <label className="lesson-composer-label" htmlFor="lesson-question"><span>سؤال أو ملاحظة</span><span>العنصر الحالي: {activeSection.label}</span></label>
            <div className="lesson-composer-box">
              <textarea id="lesson-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="مثال: لماذا يستمر الراكب في الحركة؟" rows={2} data-testid="input-lesson-question" />
              <button type="button" className="lesson-icon-button" onClick={() => attachmentInputRef.current?.click()} aria-label="إرفاق صورة الحل" data-testid="button-attach-handwritten"><ImagePlus size={17} /></button>
              <button type="submit" className="lesson-send-button" aria-label="إرسال السؤال إلى فهيم" disabled={!question.trim() || isThinking} data-testid="button-send-lesson-question"><Send size={16} /></button>
            </div>
            <input ref={attachmentInputRef} type="file" accept="image/*" onChange={handleAttachment} hidden data-testid="input-handwritten-image" />
            {session.attachment && (
              <div className="lesson-attachment" data-testid="status-handwritten-attached">
                <img src={session.attachment} alt="معاينة الحل المكتوب بخط اليد" />
                <span><strong>{session.attachmentName || 'صورة الحل'}</strong><small>أرسلت إلى فهيم للتحليل</small></span>
                <button type="button" onClick={removeAttachment} aria-label="حذف الصورة المرفقة" data-testid="button-remove-handwritten"><X size={14} /></button>
              </div>
            )}
            {attachmentError && <p className="lesson-field-error" role="alert" data-testid="status-attachment-error">{attachmentError}</p>}
            {(isThinking || analysisState === 'analyzing') && <div className="lesson-thinking" role="status" data-testid="status-ai-generation"><LoaderCircle size={14} /><span>{analysisState === 'analyzing' ? 'فهيم يقرأ المحاولة ويبحث عن أول خطأ...' : 'فهيم يصوغ لك خطوة مناسبة...'}</span><i /></div>}
            {analysisState === 'error' && <div className="lesson-analysis-error" role="alert" data-testid="status-attempt-analysis-error"><span>{analysisError}</span><button type="button" onClick={() => { if (session.attachment) void analyzeAttempt(session.attachment, session.attachmentName ?? 'محاولة'); }}>إعادة التحليل</button></div>}
            {analysis && (
              <div className="lesson-analysis-card" data-testid="card-attempt-analysis">
                <div className="lesson-analysis-header"><strong>قراءة فهيم للمحاولة</strong><span>أضيفت إلى بنك الأخطاء</span></div>
                <div className="lesson-analysis-row is-correct"><span>آخر خطوة صحيحة</span><strong>{analysis.lastCorrectStep}</strong></div>
                <div className="lesson-analysis-row is-error"><span>بداية الخطأ</span><strong>{analysis.firstErrorStep}</strong></div>
                <p>{analysis.feedback}</p>
                <div className="lesson-analysis-actions"><button type="button" onClick={resetToLastCorrect} data-testid="button-reset-to-last-correct"><RotateCcw size={13} /> العودة لآخر خطوة</button><button type="button" onClick={buildExercise} data-testid="button-generate-error-exercise">ابنِ تمرينًا مشابهًا</button></div>
              </div>
            )}
          </form>
        </section>

        <section className="lesson-panel lesson-teaching-panel" aria-label="منطقة شرح فهيم واللوح">
          <div className="lesson-teaching-header">
            <div>
              <span className="lesson-panel-kicker"><Volume2 size={13} /> يشرح الآن</span>
              <h2>{activeSection.title}</h2>
              <p>{activeSection.duration} · {activeSection.label}</p>
            </div>
            <div className="lesson-board-owl"><img src={analysis ? owlAgentViolet : progress === 100 ? owlAgentGold : owlAgentMint} alt="فهيم يشرح المفهوم الحالي" /></div>
          </div>
          <div className="lesson-explanation">
            <span className="lesson-explanation-label">فكرة مركزيّة</span>
            <p>{activeSection.explanation.replace(`${activeSection.highlight} `, '')} <button type="button" className={`lesson-highlight-part ${highlightedPart === activeSection.highlight ? 'is-selected' : ''}`} onClick={() => setHighlightedPart(activeSection.highlight)} aria-pressed={highlightedPart === activeSection.highlight} data-testid="button-highlight-concept">{activeSection.highlight}</button></p>
            {activeSource && <div className="lesson-source-line"><BookOpen size={13} /><span>{activeSource.title}</span><small>{activeSource.source} · ص {activeSource.page}</small></div>}
            <button type="button" className="lesson-ask-highlight" onClick={() => { if (highlightedPart) void askFahim(`اشرح لي الجزء المحدد: ${highlightedPart}`); }} disabled={!highlightedPart} data-testid="button-ask-highlighted"><Highlighter size={13} /> اسألي عن الجزء المحدد</button>
          </div>
          <div className="lesson-whiteboard-wrap">
            <div className="lesson-whiteboard-toolbar">
              <span><BarChart3 size={14} /> لوح فهيم</span>
              <div>
                <button type="button" className={boardMode === 'pen' ? 'is-selected' : ''} onClick={() => setBoardMode('pen')} aria-label="أداة الكتابة" data-testid="button-whiteboard-pen"><PenLine size={15} /></button>
                <button type="button" className={boardMode === 'highlight' ? 'is-selected' : ''} onClick={() => setBoardMode('highlight')} aria-label="أداة التظليل" data-testid="button-whiteboard-highlight"><Highlighter size={15} /></button>
                <button type="button" onClick={clearBoard} aria-label="مسح الكتابة" data-testid="button-whiteboard-clear"><Eraser size={15} /></button>
              </div>
            </div>
            <div className="lesson-canvas-shell">
              <canvas ref={canvasRef} className="lesson-whiteboard-canvas" onPointerDown={startDrawing} onPointerMove={continueDrawing} onPointerUp={finishDrawing} onPointerCancel={finishDrawing} aria-label="لوح تفاعلي للكتابة والرسم" data-testid="canvas-lesson-whiteboard" />
              <span className="lesson-canvas-hint">{activeSection.id === 'graph' ? 'الميل يروي قصة الحركة' : 'اكتبي أو ارسمِي فوق اللوح'}</span>
            </div>
          </div>
          <div className="lesson-teaching-footer">
            <div className="lesson-narration" role="status" aria-live="polite">
              <button type="button" className="lesson-play-button" onClick={() => setIsPlaying((playing) => !playing)} aria-label={isPlaying ? 'إيقاف شرح فهيم' : 'تشغيل شرح فهيم'} data-testid="button-toggle-narration">{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
              <div className="lesson-narration-copy"><strong>{isPlaying ? 'فهيم يشرح لك...' : 'شرح فهيم جاهز'}</strong><span>{isPlaying ? activeSection.explanation : 'استمعي للفكرة الأساسية أو اقرئيها على اللوح.'}</span><div className="lesson-narration-progress"><span style={{ width: `${narrationProgress}%` }} /></div></div>
            </div>
            <form className="lesson-board-question" onSubmit={(event) => { event.preventDefault(); void askFahim(question || `ساعدني في فهم ${activeSection.label}`); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="اسألي فهيم عن اللوح" aria-label="سؤال فهيم عن اللوح" data-testid="input-board-question" /><button type="submit" aria-label="إرسال سؤال اللوح" data-testid="button-send-board-question"><MessageCircle size={15} /></button></form>
          </div>
          <div className="lesson-examples">
            <div className="lesson-examples-heading"><h3>تثبيت سريع</h3><span>{completedCount} / {activeExamples.length}</span></div>
            <div className="lesson-example-list">
              {activeExamples.map((example) => {
                const done = session.completedExamples.includes(example.id);
                return <button key={example.id} type="button" className={`lesson-example ${done ? 'is-done' : ''}`} onClick={() => toggleExample(example.id)} aria-pressed={done} data-testid={`button-complete-example-${example.id}`}><span className="lesson-example-check">{done && <Check size={13} />}</span><span className="lesson-example-copy"><strong>{example.title}</strong><small>{example.detail}</small></span></button>;
              })}
            </div>
            {generatedExercise && <div className="lesson-generated-exercise" data-testid="card-generated-error-exercise"><span>تمرين يعالج نفس الخطأ</span><p>{generatedExercise}</p></div>}
          </div>
          <div className="lesson-note-card">
            <div className="lesson-note-header"><strong><Save size={13} /> ملاحظتك</strong><span>{noteStatus}</span></div>
            <textarea value={session.note} onChange={(event) => { setNoteStatus('يُحفظ الآن'); setSession((current) => ({ ...current, note: event.target.value })); }} placeholder="اكتبي علاقة تريدين تذكرها..." aria-label="ملاحظة الدرس" data-testid="input-lesson-note" />
            <button type="button" className="lesson-save-note" onClick={() => { window.localStorage.setItem(sessionKey, JSON.stringify(session)); setNoteStatus('حُفظت الملاحظة'); }} data-testid="button-save-lesson-note"><Save size={12} /> حفظ الملاحظة</button>
            {attemptBank.length > 0 && <div className="lesson-bank"><div className="lesson-bank-heading"><strong>بنك الأخطاء</strong><span>{attemptBank.length} محاولات</span></div>{attemptBank.slice(0, 2).map((item) => <button type="button" key={item.id} className="lesson-bank-item" onClick={() => { setAnalysis(item); setAnalysisState('ready'); }} data-testid={`button-open-attempt-${item.id}`}><span>{item.fileName}</span><small>{item.createdAt} · {item.summaryAnchor}</small></button>)}</div>}
          </div>
        </section>
      </div>
    </section>
  );
}