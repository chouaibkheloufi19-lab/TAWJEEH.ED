import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  getGetLearningScheduleQueryKey,
  getListKnowledgeQueryKey,
  getGetSummaryBankQueryKey,
  useCompleteLesson,
  useListKnowledge,
  useRecordLearningAttempt,
  type KnowledgeCard,
} from '@workspace/api-client-react';
import owlAgentGold from '@assets/agent-success-cropped.png';
import owlAgentMint from '@assets/agent-guiding-cropped.png';
import owlAgentTeal from '@assets/agent-creation-cropped.png';
import owlAgentViolet from '@assets/agent-thinking-cropped.png';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';
import owlThinkingVideo from '@assets/Owl_mascot_thinking_and_solving_202609022335_1788425680408.mp4';
import { useUser } from '@clerk/react';
import {
  canCompleteEvaluation,
  getEvaluationBlocker,
  getEvaluationDay,
  getEvaluationPlan,
  type ActiveAgent,
  type EvaluationMode,
  type EvaluationPlan,
} from '@/lib/evaluation';

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

type GeneratedGraphPoint = Point & { label?: string };

type GeneratedLesson = {
  status: 'generated';
  lessonTitle: string;
  sourceDocuments: { title: string; source: string; page: number }[];
  objective: string;
  elements: { id: string; title: string; kind: string; summary: string }[];
  explanation: string;
  highlight: string;
  graph: {
    type: 'line' | 'bar' | 'none';
    title: string;
    xLabel: string;
    yLabel: string;
    points: GeneratedGraphPoint[];
  };
  prompt: string;
  concept: LessonSectionId;
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
  startedAt: string;
  concludedAt: string | null;
  evaluationMode: EvaluationMode;
  activeAgent: ActiveAgent;
  evaluationCompletedAt: string | null;
};

type LocalSummary = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  subject: string;
  summary: string;
  concepts: { id: string; title: string; summary: string; mastery: number }[];
  startedAt: string;
  completedAt: string;
  progress: number;
  officialStamp: string;
  logo: string;
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
const profileKey = 'user.profile';
const lessonId = 'newton-motion';

function readSession(defaultEvaluationMode: EvaluationMode): LessonSession {
  const fallback: LessonSession = {
    activeConcept: 'definition',
    completedExamples: [],
    note: '',
    attachment: null,
    attachmentName: null,
    whiteboardStrokes: [],
    startedAt: new Date().toISOString(),
    concludedAt: null,
    evaluationMode: defaultEvaluationMode,
    activeAgent: 'faheem',
    evaluationCompletedAt: null,
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
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : fallback.startedAt,
      concludedAt: typeof parsed.concludedAt === 'string' ? parsed.concludedAt : null,
      evaluationMode: parsed.evaluationMode === 'fixed-foundation' || parsed.evaluationMode === 'adaptive-accelerated'
        ? parsed.evaluationMode
        : fallback.evaluationMode,
      activeAgent: parsed.activeAgent === 'dalil-exercises' ? 'dalil-exercises' : 'faheem',
      evaluationCompletedAt: typeof parsed.evaluationCompletedAt === 'string' ? parsed.evaluationCompletedAt : null,
    };
  } catch {
    return fallback;
  }
}

function formatSessionTime(isoDate: string) {
  return new Intl.DateTimeFormat('ar-DZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(isoDate));
}

function saveSummaryToProfile(summary: LocalSummary) {
  try {
    const profile = JSON.parse(window.localStorage.getItem(profileKey) || '{}') as { summaryBank?: LocalSummary[] };
    const bank = Array.isArray(profile.summaryBank) ? profile.summaryBank : [];
    profile.summaryBank = [summary, ...bank.filter((item) => item?.id !== summary.id && item?.lessonId !== summary.lessonId)].slice(0, 20);
    window.localStorage.setItem(profileKey, JSON.stringify(profile));
  } catch {
    window.localStorage.setItem(profileKey, JSON.stringify({ summaryBank: [summary] }));
  }
}

function boardRegions(sectionId: LessonSectionId) {
  if (sectionId === 'graph') {
    return [
      { id: 'axis', label: 'المحاور والزمن', left: '7%', top: '65%', width: '33%' },
      { id: 'slope', label: 'ميل المنحنى', left: '38%', top: '25%', width: '34%' },
      { id: 'point', label: 'النقطة المحددة', left: '58%', top: '30%', width: '25%' },
    ];
  }
  if (sectionId === 'practice') {
    return [
      { id: 'forces', label: 'القوى المؤثرة', left: '14%', top: '29%', width: '31%' },
      { id: 'mass', label: 'الكتلة', left: '51%', top: '29%', width: '28%' },
      { id: 'result', label: 'القوة المحصلة', left: '29%', top: '58%', width: '42%' },
    ];
  }
  return [
    { id: 'idea', label: 'الفكرة الأساسية', left: '12%', top: '24%', width: '38%' },
    { id: 'example', label: 'المثال التطبيقي', left: '52%', top: '24%', width: '34%' },
    { id: 'check', label: 'خطوة التحقق', left: '25%', top: '58%', width: '50%' },
  ];
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

function normalizeGraphPoints(points: GeneratedGraphPoint[]) {
  if (!points.length) return [];
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  return points.map((point) => ({
    ...point,
    sx: 24 + ((point.x - minX) / xRange) * 272,
    sy: 126 - ((point.y - minY) / yRange) * 96,
  }));
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
  const selectedRegion = boardRegions(sectionId).find((region) => region.label === highlightedPart);
  if (selectedRegion) {
    const left = Number.parseFloat(selectedRegion.left) / 100 * width;
    const top = Number.parseFloat(selectedRegion.top) / 100 * height;
    const regionWidth = Number.parseFloat(selectedRegion.width) / 100 * width;
    ctx.fillStyle = 'rgba(219, 183, 96, .18)';
    ctx.strokeStyle = '#b98a2c';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.roundRect(left, top, regionWidth, height * .19, 9);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
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
  const { user } = useUser();
  const registrationAt = user?.createdAt ?? null;
  const evaluationPlan = useMemo<EvaluationPlan>(() => getEvaluationPlan(registrationAt), [registrationAt]);
  const queryClient = useQueryClient();
  const completeLessonMutation = useCompleteLesson();
  const recordAttemptMutation = useRecordLearningAttempt();
  const [session, setSession] = useState<LessonSession>(() => readSession(evaluationPlan.mode));
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
  const [generatedLesson, setGeneratedLesson] = useState<GeneratedLesson | null>(null);
  const [lessonGenerationState, setLessonGenerationState] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [lessonGenerationError, setLessonGenerationError] = useState('');
  const [summarySaveState, setSummarySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [summaryPreview, setSummaryPreview] = useState<LocalSummary | null>(null);
  const [boardMode, setBoardMode] = useState<BoardMode>('pen');
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const owlVideoRef = useRef<HTMLVideoElement>(null);
  const drawingRef = useRef<Point[]>([]);
  const knowledgeParams = useMemo(() => ({ subject: 'العلوم الفيزيائية', curriculum_year: '3AS' }), []);
  const knowledgeQuery = useListKnowledge(knowledgeParams, { query: { queryKey: getListKnowledgeQueryKey(knowledgeParams), staleTime: 5 * 60 * 1000 } });
  const knowledgeCards = useMemo(() => (knowledgeQuery.data as KnowledgeCard[] | undefined) ?? [], [knowledgeQuery.data]);
  const activeSection = useMemo(() => lessonSections.find((section) => section.id === session.activeConcept) ?? lessonSections[0], [session.activeConcept]);
  const activeSource = useMemo(() => sourceForSection(activeSection, knowledgeCards), [activeSection, knowledgeCards]);
  const activeExamples = exampleDetails[activeSection.id];
  const displayedTitle = generatedLesson?.lessonTitle ?? activeSection.title;
  const displayedExplanation = generatedLesson?.explanation ?? activeSection.explanation;
  const displayedHighlight = generatedLesson?.highlight || activeSection.highlight;
  const completedCount = activeExamples.filter((example) => session.completedExamples.includes(example.id)).length;
  const totalExamples = lessonSections.reduce((total, section) => total + exampleDetails[section.id].length, 0);
  const totalCompleted = lessonSections.reduce((total, section) => total + exampleDetails[section.id].filter((example) => session.completedExamples.includes(example.id)).length, 0);
  const progress = Math.round((totalCompleted / totalExamples) * 100);
  const hotspots = useMemo(() => boardRegions(activeSection.id), [activeSection.id]);
  const evaluationDay = getEvaluationDay(session.startedAt);
  const evaluationComplete = canCompleteEvaluation(evaluationPlan, progress, session.startedAt);
  const evaluationBlocker = getEvaluationBlocker(evaluationPlan, progress, session.startedAt);
  const faheemActive = session.activeAgent === 'faheem';

  useEffect(() => {
    setSession((current) => {
      if (current.evaluationMode === evaluationPlan.mode) return current;
      return { ...current, evaluationMode: evaluationPlan.mode, activeAgent: current.evaluationCompletedAt ? current.activeAgent : 'faheem' };
    });
  }, [evaluationPlan.mode]);

  const concludeSession = (retry = false) => {
    if (retry && !session.concludedAt) return;
    if (!retry && (!evaluationComplete || session.concludedAt || summarySaveState !== 'idle')) return;
    const completedAt = new Date().toISOString();
    const localSummary: LocalSummary = {
      id: `summary-${lessonId}`,
      lessonId,
      lessonTitle: 'قوانين نيوتن والحركة',
      subject: 'العلوم الفيزيائية',
      summary: `خلاصة جلسة فهيم: ثبّتِ ${totalCompleted} من ${totalExamples} أمثلة عملية، وراجعتِ الفكرة من ${formatSessionTime(session.startedAt)} حتى ${formatSessionTime(completedAt)}. ${session.note.trim() ? `ملاحظتك: ${session.note.trim()}` : 'يمكنك إضافة ملاحظة قصيرة من بطاقة ملاحظتك قبل الجلسة التالية.'}`,
      concepts: lessonSections.map((section) => {
        const examples = exampleDetails[section.id];
        const mastered = examples.filter((example) => session.completedExamples.includes(example.id)).length;
        return {
          id: section.id,
          title: section.title,
          summary: section.explanation,
          mastery: Math.round((mastered / examples.length) * 100),
        };
      }),
      startedAt: session.startedAt,
      completedAt,
      progress,
      officialStamp: 'TAWJEEH.ED · OFFICIAL',
      logo: 'tawjeeh-owl-transparent.png',
    };
    saveSummaryToProfile(localSummary);
    setSummaryPreview(localSummary);
    setSummarySaveState('saving');
    setSession((current) => ({
      ...current,
      concludedAt: completedAt,
      evaluationCompletedAt: completedAt,
      activeAgent: 'dalil-exercises',
    }));
    completeLessonMutation.mutate({
      lessonId,
      data: {
        lesson_id: lessonId,
        lesson_title: localSummary.lessonTitle,
        subject: localSummary.subject,
        summary: localSummary.summary,
        concepts: localSummary.concepts.map(({ id, title, summary: conceptSummary }) => ({
          id,
          title,
          summary: conceptSummary,
        })),
      },
    }, {
      onSuccess: () => {
        setSummarySaveState('saved');
        void queryClient.invalidateQueries({ queryKey: getGetSummaryBankQueryKey() });
      },
      onError: () => setSummarySaveState('error'),
    });
  };

  useEffect(() => {
    try {
      // Keep the working image in memory for the active session, but never
      // push multi-megabyte image bytes into localStorage.
      window.localStorage.setItem(sessionKey, JSON.stringify({ ...session, attachment: null }));
      setNoteStatus('محفوظ محليًا');
    } catch {
      setNoteStatus('تعذر الحفظ المحلي');
    }
  }, [session]);

  useEffect(() => {
    window.localStorage.setItem(attemptBankKey, JSON.stringify(attemptBank));
  }, [attemptBank]);

  useEffect(() => {
    if (!isPlaying) return;
    void owlVideoRef.current?.play().catch(() => undefined);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(displayedExplanation);
      utterance.lang = 'ar-SA';
      utterance.rate = .92;
      window.speechSynthesis.speak(utterance);
    }
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, [isPlaying]);

  useEffect(() => {
    setNarrationProgress(0);
    setIsPlaying(false);
    setHighlightedPart('');
    setGeneratedLesson(null);
    setLessonGenerationState('idle');
    setLessonGenerationError('');
    if (owlVideoRef.current) {
      owlVideoRef.current.pause();
      owlVideoRef.current.currentTime = 0;
    }
    setNarrationProgress(0);
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

  const generateLesson = async () => {
    setLessonGenerationState('generating');
    setLessonGenerationError('');
    try {
      const response = await fetch('/api/lesson/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lesson: 'قوانين نيوتن والحركة',
          level: '3AS',
          activeConcept: activeSection.title,
          attemptContext: analysis
            ? `${analysis.lastCorrectStep} — ${analysis.firstError}: ${analysis.feedback}`
            : session.note || '',
        }),
      });
      const payload = await response.json() as Partial<GeneratedLesson> & { message?: string };
      if (!response.ok || typeof payload.lessonTitle !== 'string' || !Array.isArray(payload.elements)) {
        throw new Error(payload.message || 'تعذر توليد شرح الدرس من المصادر.');
      }
      setGeneratedLesson({ ...(payload as Omit<GeneratedLesson, 'concept'>), concept: activeSection.id });
      setLessonGenerationState('ready');
      setHighlightedPart(typeof payload.highlight === 'string' ? payload.highlight : '');
      setMessages((current) => [...current, {
        id: `generated-lesson-${Date.now()}`,
        role: 'assistant',
        text: `حضّرت لك شرحًا مخصصًا عن «${payload.lessonTitle}». ابدئي بالهدف ثم اختاري عنصرًا واحدًا للتثبيت.`,
      }]);
    } catch (error) {
      setLessonGenerationState('error');
      setLessonGenerationError(error instanceof Error ? error.message : 'تعذر توليد شرح الدرس الآن.');
    }
  };

  const askFahim = async (text: string) => {
    if (!faheemActive) return;
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
          context: analysis
            ? `${analysis.lastCorrectStep} — ${analysis.firstError}`
            : highlightedPart || displayedExplanation,
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
      recordAttemptMutation.mutate({
        data: {
          lesson_id: lessonId,
          lesson_title: 'قوانين نيوتن والحركة',
          concept_id: activeSection.id,
          concept_title: activeSection.title,
          error_tag: nextAnalysis.summaryAnchor || nextAnalysis.firstErrorStep,
          is_correct: false,
        },
      }, {
        onSuccess: (result) => {
          void queryClient.invalidateQueries({ queryKey: getGetSummaryBankQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetLearningScheduleQueryKey() });
          if (result.remediation) {
            setMessages((current) => [...current, {
              id: `remediation-${Date.now()}`,
              role: 'assistant',
              text: `رصدت فجوة متكررة في «${result.metric.concept_title}». أضفت «غرفة إنعاش مستعجلة» إلى برنامجك لمراجعة هذا المفهوم.`,
            }]);
          }
        },
      });
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

  const selectBoardRegion = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pauseNarration();
    const point = getCanvasPoint(event);
    const region = hotspots.find((item) => {
      const left = Number.parseFloat(item.left) / 100;
      const top = Number.parseFloat(item.top) / 100;
      const right = left + Number.parseFloat(item.width) / 100;
      return point.x >= left && point.x <= right && point.y >= top && point.y <= top + .19;
    });
    if (!region) return;
    setHighlightedPart(region.label);
    setMessages((current) => [...current, {
      id: `highlight-${Date.now()}`,
      role: 'assistant',
      text: `حددتِ «${region.label}». اسأليني عنه وسأشرح الجزء نفسه خطوة خطوة.`,
    }]);
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

  const toggleNarration = () => {
    if (isPlaying) {
      pauseNarration();
      return;
    }
    setNarrationProgress(0);
    setIsPlaying(true);
  };

  const pauseNarration = () => {
    owlVideoRef.current?.pause();
    window.speechSynthesis?.cancel();
    setIsPlaying(false);
  };

  return (
    <section className="lesson-workspace" dir="rtl" data-testid="lesson-workspace">
      <header className="lesson-workspace-header">
        <div className="lesson-title-block">
          <span className="lesson-kicker"><Sparkles size={13} /> جلسة تثبيت · علوم فيزيائية</span>
          <h1>قوانين نيوتن والحركة</h1>
          <p>ثلاث نوافذ فقط: مسار واضح، تفاعل فعلي، وشرح على اللوح.</p>
        </div>
        <div className="lesson-header-controls">
          <div className="lesson-header-status" role="status" data-testid="status-lesson-progress">
            <span className="lesson-status-dot" aria-hidden="true" />
            <span>
              {session.concludedAt
                ? 'فهيم أنهى التقييم · التسليم جاهز'
                : `${evaluationPlan.title} · اليوم ${evaluationPlan.mode === 'fixed-foundation' ? `${Math.min(evaluationDay, 10)} / ١٠` : evaluationDay}`}
            </span>
            <strong>{progress}٪</strong>
          </div>
          {!session.concludedAt && (
            <div className="lesson-conclude-wrap">
              <button type="button" className="lesson-conclude-button" onClick={() => concludeSession()} disabled={!evaluationComplete} data-testid="button-conclude-lesson">
              <CheckCircle2 size={14} /> إنهاء وحفظ الملخص
              </button>
              {evaluationBlocker && <span className="lesson-evaluation-blocker">{evaluationBlocker}</span>}
            </div>
          )}
        </div>
      </header>

      <div className={`lesson-evaluation-banner ${session.concludedAt ? 'is-handed-off' : ''}`} role="status" data-testid="card-evaluation-plan">
        <div>
          <span className="lesson-panel-kicker"><Sparkles size={13} /> منطق التقييم حسب توقيت التسجيل</span>
          <strong>{evaluationPlan.title}</strong>
          <p>{evaluationPlan.description}</p>
        </div>
         <div className="lesson-evaluation-meta">
          <span>{evaluationPlan.windowLabel}</span>
          <strong>{session.concludedAt ? 'فهيم غير مفعّل' : evaluationPlan.durationLabel}</strong>
           <small>{session.concludedAt ? 'دليل + وكيل التمارين يتابعان من هنا' : `بدأت ${formatSessionTime(session.startedAt)} · الوقت مفتوح`}</small>
        </div>
      </div>

      <div className="lesson-grid">
         <aside className="lesson-panel lesson-path-panel" aria-label="مسار إتقان الطالب">
          <div className="lesson-panel-heading">
            <div>
               <span className="lesson-panel-kicker"><BookOpen size={13} /> خريطة الإتقان</span>
               <h2>مسار الطالب</h2>
               <p>نقيس الفهم قبل أن ننتقل للخطوة التالية.</p>
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

         <section className="lesson-panel lesson-conversation-panel" aria-label="منطقة التفاعل والتغذية الراجعة">
           <div className="lesson-panel-heading lesson-conversation-heading">
            <div className="lesson-fahim-chip">
              <span className="lesson-fahim-avatar"><img src={isThinking ? owlAgentViolet : analysisState === 'error' ? owlAgentGold : owlAgentTeal} alt="فهيم، مساعد تثبيت المفاهيم" /></span>
                <span><strong>{faheemActive ? 'فهيم' : 'فهيم · غير مفعّل'}</strong><small>{faheemActive ? 'تفاعل وتغذية راجعة' : 'سلّم إلى دليل + وكيل التمارين'}</small></span>
            </div>
             <span className={`lesson-live-state ${isThinking || analysisState === 'analyzing' ? 'is-working' : ''}`}><i />{!faheemActive ? 'تم التسليم' : analysisState === 'analyzing' ? 'يحلل الصورة' : isThinking ? 'يكتب الآن' : 'جاهز'}</span>
          </div>
          <div className="lesson-messages" aria-live="polite" data-testid="region-fahim-messages">
            {messages.map((message) => (
              <article key={message.id} className={`lesson-message ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`} data-testid={`message-lesson-${message.id}`}>
                <div className="lesson-message-meta">{message.role === 'assistant' ? <><Sparkles size={11} /> فهيم</> : 'أنت'}<span className="lesson-message-time">{getTimeLabel()}</span></div>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
           <form className={`lesson-composer ${!faheemActive ? 'is-disabled' : ''}`} onSubmit={handleQuestionSubmit}>
            <label className="lesson-composer-label" htmlFor="lesson-question"><span>سؤال أو ملاحظة</span><span>العنصر الحالي: {activeSection.label}</span></label>
            <div className="lesson-composer-box">
               <textarea id="lesson-question" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!faheemActive} placeholder={faheemActive ? 'مثال: لماذا يستمر الراكب في الحركة؟' : 'انتقل الحوار إلى دليل ووكيل التمارين'} rows={2} data-testid="input-lesson-question" />
               <button type="button" className="lesson-icon-button" onClick={() => attachmentInputRef.current?.click()} disabled={!faheemActive} aria-label="إرفاق صورة الحل" data-testid="button-attach-handwritten"><ImagePlus size={17} /></button>
               <button type="submit" className="lesson-send-button" aria-label="إرسال السؤال إلى فهيم" disabled={!faheemActive || !question.trim() || isThinking} data-testid="button-send-lesson-question"><Send size={16} /></button>
            </div>
             <input ref={attachmentInputRef} type="file" accept="image/*" onChange={handleAttachment} disabled={!faheemActive} hidden data-testid="input-handwritten-image" />
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
                <div className="lesson-analysis-header"><strong>قراءة فهيم للمحاولة</strong><span>{recordAttemptMutation.isPending ? 'يحفظ الربط...' : 'أضيفت إلى بنك الأخطاء'}</span></div>
                <div className="lesson-analysis-row is-correct"><span>آخر خطوة صحيحة</span><strong>{analysis.lastCorrectStep}</strong></div>
                <div className="lesson-analysis-row is-error"><span>بداية الخطأ</span><strong>{analysis.firstErrorStep}</strong></div>
                <p>{analysis.feedback}</p>
                <div className="lesson-analysis-actions"><button type="button" onClick={resetToLastCorrect} data-testid="button-reset-to-last-correct"><RotateCcw size={13} /> العودة لآخر خطوة</button><button type="button" onClick={buildExercise} data-testid="button-generate-error-exercise">ابنِ تمرينًا مشابهًا</button></div>
              </div>
            )}
          </form>
        </section>

         <section className="lesson-panel lesson-teaching-panel" aria-label="السبورة الذكية لفهيم">
          <div className="lesson-teaching-header">
            <div>
               <span className="lesson-panel-kicker"><Volume2 size={13} /> سبورة فهيم الذكية</span>
               <h2 data-testid="text-current-lesson-title">{displayedTitle}</h2>
               <p>إيقاع مقترح · {activeSection.duration} · {activeSection.label}</p>
            </div>
             <div className="lesson-teaching-actions">
               <button
                 type="button"
                 className="lesson-generate-button"
                 onClick={() => void generateLesson()}
                  disabled={!faheemActive || lessonGenerationState === 'generating'}
                 data-testid="button-generate-lesson"
               >
                 {lessonGenerationState === 'generating' ? <LoaderCircle size={13} className="lesson-spin-icon" /> : <Sparkles size={13} />}
                 {lessonGenerationState === 'generating' ? 'يُحضّر...' : generatedLesson ? 'تحديث الشرح' : 'ولّد شرحًا ذكيًا'}
               </button>
              <div className={`lesson-board-owl ${isPlaying ? 'is-speaking' : ''}`}>
                 <video
                   ref={owlVideoRef}
                   src={owlThinkingVideo}
                   muted
                   playsInline
                   loop
                   poster={owlLogoPath}
                   onTimeUpdate={(event) => {
                     const video = event.currentTarget;
                     if (video.duration > 0 && Number.isFinite(video.duration)) {
                       setNarrationProgress((video.currentTime / video.duration) * 100);
                     }
                   }}
                   aria-label="فيديو فهيم أثناء الشرح"
                   data-testid="video-fahim-blackboard"
                 />
                <span>فيديو فهيم</span>
              </div>
             </div>
          </div>
           {lessonGenerationState === 'error' && (
             <div className="lesson-generation-error" role="alert" data-testid="status-lesson-generation-error">
               <span>{lessonGenerationError}</span>
               <button type="button" onClick={() => void generateLesson()} data-testid="button-retry-lesson-generation">إعادة المحاولة</button>
             </div>
           )}
           {generatedLesson && (
             <div className="lesson-generated-lesson" data-testid="card-generated-lesson">
               <div className="lesson-generated-lesson-head">
                 <div>
                   <span className="lesson-explanation-label">شرح مخصص من مصادر المنهاج</span>
                   <h3>{generatedLesson.lessonTitle}</h3>
                 </div>
                 <span className="lesson-generated-badge"><CheckCircle2 size={12} /> جاهز</span>
               </div>
               <div className="lesson-generated-objective"><strong>هدف الجلسة</strong><span>{generatedLesson.objective}</span></div>
               <div className="lesson-generated-elements" aria-label="عناصر الدرس المولّد">
                 {generatedLesson.elements.map((element) => (
                   <article key={element.id} className="lesson-generated-element" data-testid={`card-generated-element-${element.id}`}>
                     <span>{element.kind === 'practice' ? 'تدريب' : element.kind === 'graph' ? 'رسم' : element.kind === 'recap' ? 'خلاصة' : element.kind === 'example' ? 'مثال' : 'فكرة'}</span>
                     <strong>{element.title}</strong>
                     <p>{element.summary}</p>
                   </article>
                 ))}
               </div>
               {generatedLesson.graph.type !== 'none' && generatedLesson.graph.points.length > 0 && (() => {
                 const graphPoints = normalizeGraphPoints(generatedLesson.graph.points);
                 const path = graphPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.sx} ${point.sy}`).join(' ');
                 return (
                   <div className="lesson-generated-graph" data-testid="card-generated-graph">
                     <div><strong>{generatedLesson.graph.title}</strong><span>{generatedLesson.graph.yLabel} مقابل {generatedLesson.graph.xLabel}</span></div>
                     <svg viewBox="0 0 320 150" role="img" aria-label={generatedLesson.graph.title}>
                       <path d="M24 126 H296 M24 126 V22" className="lesson-graph-axis" />
                       {generatedLesson.graph.type === 'bar'
                         ? graphPoints.map((point) => <rect key={`${point.x}-${point.y}`} x={point.sx - 7} y={point.sy} width="14" height={126 - point.sy} rx="3" className="lesson-graph-bar" />)
                         : <path d={path} className="lesson-graph-line" />}
                       {graphPoints.map((point) => <circle key={`point-${point.x}-${point.y}`} cx={point.sx} cy={point.sy} r="3.5" className="lesson-graph-point" />)}
                     </svg>
                   </div>
                 );
               })()}
               <div className="lesson-generated-footer">
                 <p><strong>سؤال فهيم:</strong> {generatedLesson.prompt}</p>
                 {generatedLesson.sourceDocuments.length > 0 && (
                   <div className="lesson-generated-sources">
                     <BookOpen size={12} />
                     <span>المصادر: {generatedLesson.sourceDocuments.slice(0, 3).map((source) => `${source.title} · ص ${source.page}`).join('، ')}</span>
                   </div>
                 )}
               </div>
             </div>
           )}
           <div className="lesson-explanation">
            <span className="lesson-explanation-label">فكرة مركزيّة</span>
             <p>{displayedExplanation.replace(`${displayedHighlight} `, '')} <button type="button" className={`lesson-highlight-part ${highlightedPart === displayedHighlight ? 'is-selected' : ''}`} onClick={() => { pauseNarration(); setHighlightedPart(displayedHighlight); }} aria-pressed={highlightedPart === displayedHighlight} data-testid="button-highlight-concept">{displayedHighlight}</button></p>
            {activeSource && <div className="lesson-source-line"><BookOpen size={13} /><span>{activeSource.title}</span><small>{activeSource.source} · ص {activeSource.page}</small></div>}
             <button type="button" className="lesson-ask-highlight" onClick={() => { if (highlightedPart) void askFahim(`اشرح لي الجزء المحدد: ${highlightedPart}`); }} disabled={!faheemActive || !highlightedPart} data-testid="button-ask-highlighted"><Highlighter size={13} /> اسألي عن الجزء المحدد</button>
          </div>
          <div className="lesson-whiteboard-wrap">
            <div className="lesson-whiteboard-toolbar">
               <span><BarChart3 size={14} /> لوح فهيم · انقري على الجزء غير الواضح</span>
              <div>
                <button type="button" className={boardMode === 'pen' ? 'is-selected' : ''} onClick={() => setBoardMode('pen')} disabled={!faheemActive} aria-label="أداة الكتابة" data-testid="button-whiteboard-pen"><PenLine size={15} /></button>
                  <button type="button" className={boardMode === 'highlight' ? 'is-selected' : ''} onClick={() => setBoardMode('highlight')} disabled={!faheemActive} aria-label="أداة التظليل والنقر" data-testid="button-whiteboard-highlight"><Highlighter size={15} /></button>
                 <button type="button" onClick={clearBoard} disabled={!faheemActive} aria-label="مسح الكتابة" data-testid="button-whiteboard-clear"><Eraser size={15} /></button>
              </div>
            </div>
            <div className="lesson-canvas-shell">
                <canvas ref={canvasRef} className={`lesson-whiteboard-canvas ${boardMode === 'highlight' ? 'is-highlighting' : ''} ${!faheemActive ? 'is-locked' : ''}`} onPointerDown={faheemActive ? (boardMode === 'highlight' ? selectBoardRegion : startDrawing) : undefined} onPointerMove={faheemActive && boardMode === 'pen' ? continueDrawing : undefined} onPointerUp={faheemActive && boardMode === 'pen' ? finishDrawing : undefined} onPointerCancel={faheemActive && boardMode === 'pen' ? finishDrawing : undefined} aria-label="لوح تفاعلي للكتابة والرسم والتحديد" data-testid="canvas-lesson-whiteboard" />
               <div className="lesson-board-hotspots" aria-label="مناطق اللوح القابلة للتحديد">
                 {hotspots.map((region) => (
                   <button
                     key={region.id}
                     type="button"
                     className={highlightedPart === region.label ? 'is-selected' : ''}
                     style={{ left: region.left, top: region.top, width: region.width }}
                       onClick={() => { if (!faheemActive) return; pauseNarration(); setBoardMode('highlight'); setHighlightedPart(region.label); }}
                      disabled={!faheemActive}
                     aria-pressed={highlightedPart === region.label}
                     aria-label={`تحديد ${region.label}`}
                     data-testid={`button-board-region-${region.id}`}
                   >
                     <span>{region.label}</span>
                   </button>
                 ))}
               </div>
              <span className="lesson-canvas-hint">{activeSection.id === 'graph' ? 'الميل يروي قصة الحركة' : 'اكتبي أو ارسمِي فوق اللوح'}</span>
            </div>
          </div>
          <div className="lesson-teaching-footer">
            <div className="lesson-narration" role="status" aria-live="polite">
                <button type="button" className="lesson-play-button" onClick={toggleNarration} disabled={!faheemActive} aria-label={isPlaying ? 'إيقاف شرح فهيم' : 'تشغيل شرح فهيم'} data-testid="button-toggle-narration">{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
                <div className="lesson-narration-copy"><strong>{isPlaying ? 'فهيم يشرح لك بالصوت...' : 'شرح فهيم جاهز'}</strong><span>{isPlaying ? displayedExplanation : 'شغّلي فيديو فهيم وصوته، ثم أوقفيه واسأليه عن أي لحظة.'}</span><div className="lesson-narration-progress"><span style={{ width: `${narrationProgress}%` }} /></div></div>
            </div>
             <form className={`lesson-board-question ${!faheemActive ? 'is-disabled' : ''}`} onSubmit={(event) => { event.preventDefault(); void askFahim(question || `ساعدني في فهم ${activeSection.label}`); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!faheemActive} placeholder={faheemActive ? 'اسألي فهيم عن اللوح' : 'انتقل اللوح إلى دليل ووكيل التمارين'} aria-label="سؤال فهيم عن اللوح" data-testid="input-board-question" /><button type="submit" disabled={!faheemActive} aria-label="إرسال سؤال اللوح" data-testid="button-send-board-question"><MessageCircle size={15} /></button></form>
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
             <button type="button" className="lesson-save-note" onClick={() => { try { window.localStorage.setItem(sessionKey, JSON.stringify({ ...session, attachment: null })); setNoteStatus('حُفظت الملاحظة'); } catch { setNoteStatus('تعذر حفظ الملاحظة'); } }} data-testid="button-save-lesson-note"><Save size={12} /> حفظ الملاحظة</button>
              {(session.concludedAt || summarySaveState !== 'idle') && <div className="lesson-summary-status" role="status" data-testid="status-summary-bank">
                <span>{summarySaveState === 'saved' ? 'حُفظ الملخص في ملفك وبنك الملخصات.' : summarySaveState === 'saving' ? 'نحفظ ملخص الجلسة في ملفك...' : summarySaveState === 'error' ? 'حُفظ محليًا، وتعذر مزامنة بنك الملخصات.' : 'سيُحفظ ملخص الجلسة تلقائيًا.'}</span>
                {summarySaveState === 'error' && <button type="button" onClick={() => concludeSession(true)}>إعادة المزامنة</button>}
             </div>}
             {summaryPreview && <div className="lesson-summary-card" data-testid="card-session-summary">
               <div className="lesson-summary-card-header">
                 <div className="lesson-summary-brand"><img src={owlLogoPath} alt="شعار توجيه" /><span><strong>ملخص جلسة فهيم</strong><small>{summaryPreview.officialStamp}</small></span></div>
                 <span className="lesson-summary-progress">{summaryPreview.progress}٪</span>
               </div>
               <p>{summaryPreview.summary}</p>
               <div className="lesson-summary-concepts">{summaryPreview.concepts.map((concept) => <span key={concept.id}><strong>{concept.mastery}٪</strong>{concept.title}</span>)}</div>
               <div className="lesson-summary-times"><span>بدأت {formatSessionTime(summaryPreview.startedAt)}</span><span>اكتملت {formatSessionTime(summaryPreview.completedAt)}</span></div>
             </div>}
            {attemptBank.length > 0 && <div className="lesson-bank"><div className="lesson-bank-heading"><strong>بنك الأخطاء</strong><span>{attemptBank.length} محاولات</span></div>{attemptBank.slice(0, 2).map((item) => <button type="button" key={item.id} className="lesson-bank-item" onClick={() => { setAnalysis(item); setAnalysisState('ready'); }} data-testid={`button-open-attempt-${item.id}`}><span>{item.fileName}</span><small>{item.createdAt} · {item.summaryAnchor}</small></button>)}</div>}
          </div>
        </section>
      </div>
    </section>
  );
}