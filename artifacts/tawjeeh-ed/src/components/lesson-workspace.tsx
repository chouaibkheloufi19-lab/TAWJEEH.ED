import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Maximize2,
  Mic,
  MicOff,
  MessageCircle,
  Minimize2,
  Pause,
  PenLine,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  getGetExamModeQueryKey,
  getGetLearningScheduleQueryKey,
  getGetErrorBankQueryKey,
  getListQuizzesQueryKey,
  getListKnowledgeQueryKey,
  getGetSummaryBankQueryKey,
  useCompleteLesson,
  useGetExamMode,
  useListKnowledge,
  useQueryKnowledge,
  useRecordLearningAttempt,
  type ExamMode,
  type KnowledgeCard,
} from '@workspace/api-client-react';
import { getAgentReadinessQueryOptions } from '@/lib/agent-readiness';
import owlAgentGold from '@assets/agent-success-cropped.png';
import owlAgentMint from '@assets/agent-guiding-cropped.png';
import owlAgentTeal from '@assets/agent-creation-cropped.png';
import owlAgentViolet from '@assets/agent-thinking-cropped.png';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';
import owlThinkingVideo from '@assets/Owl_mascot_thinking_and_solving_202609022335_1788425680408.mp4';
import { useUser } from '@clerk/react';
import { useLocation } from 'wouter';
import { fetchWithTimeout } from '@/lib/request';
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
type ActivePartner = 'dalil' | 'exercises';
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

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
  sourceNodeIds: string[];
  concept: LessonSectionId;
};

type GeneratedExercise = {
  status: 'generated';
  lessonTitle: string;
  title: string;
  prompt: string;
  answer: string;
  hint: string;
  solution: string;
  sourceDocuments: { title: string; source: string; page: number }[];
  sourceNodeIds: string[];
  grounding: {
    status: 'ready';
    query: string;
    retrievedNodeIds: string[];
    sources: { nodeId: string; title: string; source: string; page: number; quote: string }[];
  };
};

type CreativeIdea = {
  title: string;
  approach: string;
  steps: string[];
  creativeTwist: string;
  expectedOutcome: string;
  sourceNodeIds: string[];
};

type CreativeIdeasResponse = {
  status: 'generated';
  mode?: 'creative_topic';
  agent?: 'exercises';
  lessonTitle: string;
  solutionSummary: string;
  ideas: CreativeIdea[];
  sourceDocuments: { title: string; source: string; page: number }[];
  sourceNodeIds: string[];
  grounding: {
    status: 'ready';
    query: string;
    retrievedNodeIds: string[];
    sources: { nodeId: string; title: string; source: string; page: number; quote: string }[];
  };
};

type AttemptBankItem = AttemptAnalysis & {
  id: string;
  fileName: string;
  createdAt: string;
};

type LessonSession = {
  activeConcept: LessonSectionId;
  completedExamples: string[];
  exampleAnswers: Record<string, string>;
  gradedExamples: Record<string, 'correct' | 'incorrect'>;
  note: string;
  attachment: string | null;
  attachmentName: string | null;
  whiteboardStrokes: Point[][];
  startedAt: string;
  concludedAt: string | null;
  evaluationMode: EvaluationMode;
  activeAgent: ActiveAgent;
  evaluationCompletedAt: string | null;
  pausedMoment: { second: number; lessonTitle: string; explanation: string } | null;
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
  groundingQuery: string;
  groundingNodeIds: string[];
};

type FoundationalModule = {
  nodeId: string;
  title: string;
  summary: string;
  source: string;
  page: number;
  concepts: string;
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
    prompt: 'ابدأ بتحديد معنى القصور الذاتي بكلماتك.',
  },
  {
    id: 'worked-example',
    label: 'مثال محلول',
    shortLabel: 'نطبّق الفكرة',
    duration: '٨ دقائق',
    title: 'مثال من الحافلة',
    explanation: 'عند توقف الحافلة فجأة يستمر جسم الراكب في الحركة إلى الأمام، لأن حالته الحركية لم تتغير لحظيًا.',
    highlight: 'يستمر جسم الراكب في الحركة',
    prompt: 'تتبع الخطوة الأولى في المثال قبل كتابة العلاقة.',
  },
  {
    id: 'graph',
    label: 'تمثيل بياني',
    shortLabel: 'نرى العلاقة',
    duration: '٦ دقائق',
    title: 'الحركة على الرسم',
    explanation: 'يمثل ميل منحنى الموضع بدلالة الزمن السرعة، بينما يكشف تغير الميل عن تغير الحركة.',
    highlight: 'ميل منحنى الموضع',
    prompt: 'اختر نقطة على المنحنى واسأل: ماذا يخبرنا الميل هنا؟',
  },
  {
    id: 'practice',
    label: 'تدريب',
    shortLabel: 'جرّب بنفسك',
    duration: '١٠ دقائق',
    title: 'قوة محصلة، خطوة خطوة',
    explanation: 'القوة المحصلة هي مجموع القوى المؤثرة، واتجاهها هو الذي يحدد تغير الحركة.',
    highlight: 'مجموع القوى المؤثرة',
    prompt: 'اكتب القوى المعطاة واتجاه كل قوة قبل الحساب.',
  },
  {
    id: 'recap',
    label: 'خلاصة',
    shortLabel: 'نثبت المكتسب',
    duration: '٤ دقائق',
    title: 'القانون الثاني لنيوتن',
    explanation: 'يتناسب التسارع طرديًا مع القوة المحصلة وعكسيًا مع الكتلة: F = m × a.',
    highlight: 'التسارع طرديًا مع القوة',
    prompt: 'لخّص العلاقة في سطر واحد، ثم قارنها بما كتبته في ملاحظتك.',
  },
];

const sessionKey = 'tawjeeh.lesson.workspace.v1';
const attemptBankKey = 'tawjeeh.attempt.bank.v1';
const profileKey = 'user.profile';
const examDateKey = 'tawjeeh.exam.baccalaureate-date';
const defaultExamDate = `${new Date().getFullYear() + 1}-06-07`;
const lessonId = 'newton-motion';
const partnerDetails: Record<ActivePartner, {
  name: string;
  role: string;
  description: string;
  prompt: string;
}> = {
  dalil: {
    name: 'دليل',
    role: 'شريك الشرح',
    description: 'يفكك الفكرة ويصلها بمصادر المنهاج.',
    prompt: 'اكتب ما تريد توضيحه، وسأربطه بالجزء الحالي من الدرس.',
  },
  exercises: {
    name: 'وكيل التمارين',
    role: 'شريك التطبيق والموضوعات',
    description: 'يبني تمرينًا مباشرًا أو موضوعات إبداعية من المكتسبات نفسها.',
    prompt: 'اطلب تمرينًا أو موضوعات مختلفة، وسأبدأ بالحل ثم أبني لك مسارًا قابلًا للدراسة.',
  },
};

function readSession(defaultEvaluationMode: EvaluationMode): LessonSession {
  const fallback: LessonSession = {
    activeConcept: 'definition',
    completedExamples: [],
    exampleAnswers: {},
    gradedExamples: {},
    note: '',
    attachment: null,
    attachmentName: null,
    whiteboardStrokes: [],
    startedAt: new Date().toISOString(),
    concludedAt: null,
    evaluationMode: defaultEvaluationMode,
    activeAgent: 'faheem',
    evaluationCompletedAt: null,
    pausedMoment: null,
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
      exampleAnswers: parsed.exampleAnswers && typeof parsed.exampleAnswers === 'object'
        ? Object.fromEntries(Object.entries(parsed.exampleAnswers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
        : {},
      gradedExamples: parsed.gradedExamples && typeof parsed.gradedExamples === 'object'
        ? Object.fromEntries(Object.entries(parsed.gradedExamples).filter((entry): entry is [string, 'correct' | 'incorrect'] => entry[1] === 'correct' || entry[1] === 'incorrect'))
        : {},
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
      pausedMoment: parsed.pausedMoment && typeof parsed.pausedMoment === 'object'
        && typeof parsed.pausedMoment.second === 'number'
        && typeof parsed.pausedMoment.lessonTitle === 'string'
        && typeof parsed.pausedMoment.explanation === 'string'
        ? parsed.pausedMoment
        : null,
    };
  } catch {
    return fallback;
  }
}

function formatSessionTime(isoDate: string) {
  return new Intl.DateTimeFormat('ar-DZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(isoDate));
}

function normalizeAnswer(value: string) {
  return value
    .toLocaleLowerCase('ar')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, ' ')
    .trim();
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

function sourceForSection(
  section: LessonSection,
  cards: Array<Pick<KnowledgeCard, 'title' | 'type' | 'tags' | 'lesson' | 'source' | 'summary' | 'page'>>,
) {
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

function elementKindForSection(sectionId: LessonSectionId): string {
  if (sectionId === 'definition') return 'definition';
  if (sectionId === 'worked-example') return 'example';
  if (sectionId === 'graph') return 'graph';
  if (sectionId === 'practice') return 'practice';
  return 'recap';
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

function drawBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sectionId: LessonSectionId,
  strokes: Point[][],
  mode: BoardMode,
  highlightedPart: string,
  groundedDiagram: boolean,
) {
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
  if (groundedDiagram && (sectionId === 'graph' || sectionId === 'recap' || highlightedPart)) {
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
    ctx.strokeStyle = '#005f73';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left + 8, bottom - 10);
    ctx.bezierCurveTo(width * .34, height * .67, width * .48, height * .56, width * .63, height * .43);
    ctx.bezierCurveTo(width * .71, height * .36, width * .77, height * .29, right - 3, top + 8);
    ctx.stroke();
    ctx.fillStyle = '#005f73';
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
  const fixedLessonTitle = 'قوانين نيوتن والحركة';
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const registrationAt = user?.createdAt ?? null;
  const evaluationPlan = useMemo<EvaluationPlan>(() => getEvaluationPlan(registrationAt), [registrationAt]);
  const queryClient = useQueryClient();
  const completeLessonMutation = useCompleteLesson();
  const recordAttemptMutation = useRecordLearningAttempt();
  const queryKnowledgeMutation = useQueryKnowledge();
  const examDate = useMemo(() => window.localStorage.getItem(examDateKey) || defaultExamDate, []);
  const examModeQuery = useGetExamMode(
    { exam_date: examDate },
    { query: { queryKey: getGetExamModeQueryKey({ exam_date: examDate }), staleTime: 60_000 } },
  );
  const examMode = examModeQuery.data as ExamMode | undefined;
  const [session, setSession] = useState<LessonSession>(() => readSession(evaluationPlan.mode));
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [highlightedPart, setHighlightedPart] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [narrationProgress, setNarrationProgress] = useState(0);
  const [noteStatus, setNoteStatus] = useState('محفوظ محليًا');
  const [attachmentError, setAttachmentError] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [chatCircuitOpen, setChatCircuitOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AttemptAnalysis | null>(null);
  const [analysisState, setAnalysisState] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [attemptBank, setAttemptBank] = useState<AttemptBankItem[]>(readAttemptBank);
  const [generatedExercise, setGeneratedExercise] = useState<GeneratedExercise | null>(null);
  const [creativeIdeas, setCreativeIdeas] = useState<CreativeIdeasResponse | null>(null);
  const [selectedCreativeTopic, setSelectedCreativeTopic] = useState<CreativeIdea | null>(null);
  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [topicStudioOpen, setTopicStudioOpen] = useState(true);
  const [generatedLesson, setGeneratedLesson] = useState<GeneratedLesson | null>(null);
  const [lessonGenerationState, setLessonGenerationState] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [lessonGenerationError, setLessonGenerationError] = useState('');
  const [summarySaveState, setSummarySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [summaryPreview, setSummaryPreview] = useState<LocalSummary | null>(null);
  const [boardMode, setBoardMode] = useState<BoardMode>('pen');
  const [isBoardImmersive, setIsBoardImmersive] = useState(false);
  const [isLessonRailCollapsed, setIsLessonRailCollapsed] = useState(false);
  const [activePartner, setActivePartner] = useState<ActivePartner>('dalil');
  const [exerciseAnswer, setExerciseAnswer] = useState('');
  const [exerciseFeedback, setExerciseFeedback] = useState<'correct' | 'retry' | null>(null);
  const [showExerciseHint, setShowExerciseHint] = useState(false);
  const [showExerciseSolution, setShowExerciseSolution] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const owlVideoRef = useRef<HTMLVideoElement>(null);
  const drawingRef = useRef<Point[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const knowledgeParams = useMemo(() => ({ subject: 'العلوم الفيزيائية', curriculum_year: '3AS' }), []);
  const knowledgeQuery = useListKnowledge(knowledgeParams, { query: { queryKey: getListKnowledgeQueryKey(knowledgeParams), staleTime: 5 * 60 * 1000 } });
  const knowledgeCards = useMemo(() => (knowledgeQuery.data as KnowledgeCard[] | undefined) ?? [], [knowledgeQuery.data]);
  const agentReadinessQuery = useQuery(getAgentReadinessQueryOptions(user?.id));
  const foundationalSources = useMemo<KnowledgeCard[]>(
    () => (agentReadinessQuery.data?.foundationalModules ?? []).map((module) => ({
      id: module.nodeId,
      title: module.title,
      summary: module.summary,
      subject: 'العلوم الفيزيائية',
      unit: '',
      lesson: module.title,
      type: 'reference',
      difficulty: 'mixed',
      source: module.source,
      page: module.page,
      tags: module.concepts.split(',').map((tag) => tag.trim()).filter(Boolean),
    })),
    [agentReadinessQuery.data?.foundationalModules],
  );
  const ragReady = agentReadinessQuery.data?.status === 'ready'
    && agentReadinessQuery.data.foundationalModules.length > 0
    && agentReadinessQuery.data.retrieval.status === 'ready';
  const activeSection = useMemo(() => lessonSections.find((section) => section.id === session.activeConcept) ?? lessonSections[0], [session.activeConcept]);
  const activeSource = useMemo(() => sourceForSection(activeSection, foundationalSources), [activeSection, foundationalSources]);
  const activeExamples = useMemo(() => {
    if (!ragReady || !activeSource || !generatedLesson) return [];
    const element = generatedLesson.elements.find((item) => item.kind === elementKindForSection(activeSection.id));
    if (!element) return [];
    return [{
      id: `${activeSection.id}-grounded`,
      title: element.title,
      detail: element.summary.replace(/\s+/g, ' ').trim().slice(0, 320),
      expectedKeywords: activeSource.tags.map((concept) => concept.trim()).filter(Boolean).slice(0, 3),
    }];
  }, [activeSection.id, activeSource, generatedLesson, ragReady]);
  const displayedElement = generatedLesson?.elements.find((item) => item.kind === elementKindForSection(activeSection.id));
  const displayedTitle = fixedLessonTitle;
  const sourceExcerpt = activeSource?.summary?.replace(/\s+/g, ' ').trim().slice(0, 520) ?? '';
  const displayedExplanation = ragReady && generatedLesson
    ? generatedLesson.explanation
    : 'يُحضّر شرح الدرس من محتوى المنهاج، وسيظهر هنا بعد اكتمال التحضير.';
  const displayedHighlight = ragReady && generatedLesson ? generatedLesson.highlight : 'فكرة الدرس';
  const completedCount = activeExamples.filter((example) => session.gradedExamples[example.id] === 'correct').length;
  const totalExamples = lessonSections.length;
  const totalCompleted = lessonSections.filter((section) => session.gradedExamples[`${section.id}-grounded`] === 'correct').length;
  const progress = Math.round((totalCompleted / totalExamples) * 100);
  const hotspots = useMemo(() => boardRegions(activeSection.id), [activeSection.id]);
  const evaluationDay = getEvaluationDay(session.startedAt);
  const evaluationComplete = canCompleteEvaluation(evaluationPlan, progress, session.startedAt);
  const evaluationBlocker = getEvaluationBlocker(evaluationPlan, progress, session.startedAt);
  const foundationExpired = evaluationDay > 10;
  const phase4Active = Boolean(session.concludedAt) || foundationExpired || session.activeAgent === 'dalil-exercises';
  const agentsAvailable = ragReady && Object.values(agentReadinessQuery.data?.agents ?? {}).every((agent) => agent.status === 'ready');
  const handoffComplete = (phase4Active || agentsAvailable) && ragReady;
  const faheemActive = !phase4Active && session.activeAgent === 'faheem';
  const lessonToolsActive = ragReady;
  const activePartnerDetails = useMemo(() => {
    const details = partnerDetails[activePartner];
    if (activePartner === 'dalil' && examMode?.reduce_passive_explanation) {
      return {
        ...details,
        description: 'شرح سريع يوصلك إلى الخطوة التالية.',
        prompt: 'اكتب موضع التعثر، وسأعطيك خلاصة قصيرة ثم تمرينًا مباشرًا.',
      };
    }
    return details;
  }, [activePartner, examMode?.reduce_passive_explanation]);
  const intensiveExamMode = examMode?.mode === 'pre_exam' || examMode?.mode === 'error_stack';

  const openChatCircuit = () => {
    setChatCircuitOpen(true);
    setMessages((current) => current.some((message) => message.id === 'chat-api-fallback')
      ? current
      : [...current, {
          id: 'chat-api-fallback',
          role: 'assistant',
          text: 'تعذر الاتصال بخدمة التعلّم الآن. حدّث الصفحة للمتابعة.',
        }]);
  };

  useEffect(() => {
    setSession((current) => {
      if (current.evaluationMode === evaluationPlan.mode) return current;
      return { ...current, evaluationMode: evaluationPlan.mode, activeAgent: current.evaluationCompletedAt ? current.activeAgent : 'faheem' };
    });
  }, [evaluationPlan.mode]);

  useEffect(() => {
    if ((!foundationExpired && !session.concludedAt) || session.activeAgent !== 'faheem') return;
    setSession((current) => current.activeAgent === 'faheem' ? { ...current, activeAgent: 'dalil-exercises' } : current);
    setMessages((current) => current.some((message) => message.id === 'phase4-handoff')
      ? current
      : [...current, {
          id: 'phase4-handoff',
          role: 'assistant',
          text: foundationExpired && !session.concludedAt
            ? 'اكتملت الأيام العشرة التأسيسية. فهيم يختتم دوره هنا، ودليل ووكيل التمارين يتابعان معك المرحلة التالية.'
            : 'اكتمل التشخيص التأسيسي. فهيم سلّم لك المساحة بهدوء: دليل للشرح، ووكيل التمارين للتطبيق.',
        }]);
  }, [foundationExpired, session.activeAgent, session.concludedAt]);

  useEffect(() => {
    if (!ragReady || !activeSource) return;
    setMessages((current) => current.some((message) => message.id === 'grounded-welcome')
      ? current
      : [...current, {
          id: 'grounded-welcome',
          role: 'assistant',
          text: `أهلًا، أنا فهيم. سنعمل الآن على درس «${fixedLessonTitle}» من محتوى المنهاج، خطوةً خطوة.`,
        }]);
  }, [activeSource, fixedLessonTitle, ragReady]);

  const concludeSession = (retry = false) => {
    if (retry && !session.concludedAt) return;
    if (!ragReady) {
      setSummarySaveState('error');
      return;
    }
    if (!retry && (!evaluationComplete || session.concludedAt || summarySaveState !== 'idle')) return;
    const completedAt = new Date().toISOString();
    const localSummary: LocalSummary = {
      id: `summary-${lessonId}`,
      lessonId,
      lessonTitle: 'قوانين نيوتن والحركة',
      subject: 'العلوم الفيزيائية',
      summary: `خلاصة جلسة فهيم مؤسسة على المصدر المسترجع: ثبّت ${totalCompleted} من ${totalExamples} أمثلة عملية، وراجعت الفكرة من ${formatSessionTime(session.startedAt)} حتى ${formatSessionTime(completedAt)}. ${sourceExcerpt || 'لم يُسترجع مقتطف مصدر لهذه الجلسة.'} ${session.note.trim() ? `ملاحظتك: ${session.note.trim()}` : 'يمكنك إضافة ملاحظة قصيرة من بطاقة ملاحظتك قبل الجلسة التالية.'}`,
      concepts: lessonSections.map((section) => {
        const mastered = session.gradedExamples[`${section.id}-grounded`] === 'correct' ? 1 : 0;
        return {
          id: section.id,
          title: generatedLesson?.elements.find((item) => item.kind === elementKindForSection(section.id))?.title ?? section.label,
          summary: sourceForSection(section, foundationalSources)?.summary || 'لا يوجد مقتطف مسترجع لهذا المفهوم بعد.',
          mastery: mastered * 100,
        };
      }),
      startedAt: session.startedAt,
      completedAt,
      progress,
      officialStamp: 'TAWJEEH.ED · OFFICIAL',
      logo: 'tawjeeh-owl-transparent.png',
      groundingQuery: agentReadinessQuery.data?.retrieval.query ?? '',
      groundingNodeIds: agentReadinessQuery.data?.retrieval.retrievedNodeIds ?? [],
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
    setMessages((current) => [...current, {
      id: `handoff-${Date.now()}`,
      role: 'assistant',
      text: 'اكتملت الخطوة التأسيسية. فهيم سلّم لك المساحة بهدوء: دليل يشرح عندما تتعقد الفكرة، وتمارين تساعدك عندما تكون جاهزًا للتطبيق.',
    }]);
    completeLessonMutation.mutate({
      lessonId,
      data: {
        lesson_id: lessonId,
        lesson_title: localSummary.lessonTitle,
        subject: localSummary.subject,
        summary: localSummary.summary,
          grounding_query: localSummary.groundingQuery,
          grounding_node_ids: localSummary.groundingNodeIds,
        concepts: localSummary.concepts.map(({ id, title, summary: conceptSummary, mastery }) => ({
          id,
          title,
          summary: conceptSummary,
          mastery,
        })),
      },
    }, {
      onSuccess: () => {
        setSummarySaveState('saved');
        void queryClient.invalidateQueries({ queryKey: getGetSummaryBankQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListQuizzesQueryKey() });
      },
      onError: () => setSummarySaveState('error'),
    });
  };

  useEffect(() => {
    if (progress === 100 && !session.concludedAt && summarySaveState === 'idle') {
      concludeSession();
    }
  }, [progress, session.concludedAt, summarySaveState]);

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

  useEffect(() => () => {
    speechRecognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    setNarrationProgress(0);
    setIsPlaying(false);
    setHighlightedPart('');
    setGeneratedLesson(null);
    setCreativeIdeas(null);
    setLessonGenerationState('idle');
    setLessonGenerationError('');
    if (owlVideoRef.current) {
      owlVideoRef.current.pause();
      owlVideoRef.current.currentTime = 0;
    }
    setNarrationProgress(0);
  }, [activeSection.id]);

  useEffect(() => {
    document.body.style.overflow = isBoardImmersive ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isBoardImmersive]);

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
     drawBoard(
       context,
       rect.width,
       rect.height,
       activeSection.id,
       session.whiteboardStrokes,
       boardMode,
       highlightedPart,
       Boolean(generatedLesson),
     );
  }, [activeSection.id, boardMode, highlightedPart, session.whiteboardStrokes]);

  const selectSection = (section: LessonSection) => {
    if (section.id === activeSection.id) return;
    setSession((current) => ({ ...current, activeConcept: section.id }));
    setMessages((current) => [...current, { id: `section-${section.id}-${Date.now()}`, role: 'assistant', text: `انتقلنا إلى «${section.label}». ${section.prompt}` }]);
  };

  const gradeExample = (exampleId: string) => {
    const example = activeExamples.find((item) => item.id === exampleId);
    if (!example) return;
    const answer = session.exampleAnswers[exampleId] ?? '';
    const normalized = normalizeAnswer(answer);
    const isCorrect = answer.trim().length > 0 && example.expectedKeywords.every((keyword) => normalized.includes(normalizeAnswer(keyword)));
    setSession((current) => ({
      ...current,
      completedExamples: isCorrect
        ? [...current.completedExamples.filter((id) => id !== exampleId), exampleId]
        : current.completedExamples.filter((id) => id !== exampleId),
      gradedExamples: { ...current.gradedExamples, [exampleId]: isCorrect ? 'correct' : 'incorrect' },
    }));
    recordAttemptMutation.mutate({
      data: {
        lesson_id: lessonId,
        lesson_title: 'قوانين نيوتن والحركة',
        concept_id: activeSection.id,
        concept_title: activeSection.title,
        error_tag: isCorrect ? 'correct' : `فجوة ${activeSection.title} · ${example.expectedKeywords.join('، ')}`,
        is_correct: isCorrect,
      },
    }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetSummaryBankQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetLearningScheduleQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetErrorBankQueryKey() });
      },
    });
    setMessages((current) => [...current, {
      id: `example-${exampleId}-${Date.now()}`,
      role: 'assistant',
      text: isCorrect
        ? `أحسنت. إجابتك تثبت «${example.title}». انتقل للخطوة التالية عندما تكون جاهزًا.`
        : `اقتربت. أعد النظر في المطلوب داخل «${example.title}»، ثم اكتب إجابة تتضمن الفكرة الأساسية.`,
    }]);
  };

  const generateLesson = async () => {
    if (!ragReady) {
      setLessonGenerationState('error');
      setLessonGenerationError('لم يكتمل تحضير محتوى الدرس بعد. أعد المحاولة بعد قليل.');
      return;
    }
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
       if (!response.ok || typeof payload.lessonTitle !== 'string' || !Array.isArray(payload.elements) || !Array.isArray(payload.sourceNodeIds)) {
        throw new Error(payload.message || 'تعذر توليد شرح الدرس من المصادر.');
      }
       setGeneratedLesson({
         ...(payload as Omit<GeneratedLesson, 'concept'>),
         lessonTitle: fixedLessonTitle,
         concept: activeSection.id,
       });
      setLessonGenerationState('ready');
      setHighlightedPart(typeof payload.highlight === 'string' ? payload.highlight : '');
      setMessages((current) => [...current, {
        id: `generated-lesson-${Date.now()}`,
        role: 'assistant',
          text: `حضّرت لك شرحًا مخصصًا في «${fixedLessonTitle}». ابدأ بالهدف ثم اختر عنصرًا واحدًا للتثبيت.`,
      }]);
    } catch (error) {
      setLessonGenerationState('error');
      setLessonGenerationError(error instanceof Error ? error.message : 'تعذر توليد شرح الدرس الآن.');
    }
  };

  const askCopilotQuestion = async (text: string, topic = selectedCreativeTopic) => {
    const cleanText = text.trim();
    if (!cleanText || !ragReady || isThinking || chatCircuitOpen) return;
    const topicContext = topic
      ? [
          `عنوان الموضوع الإبداعي: ${topic.title}`,
          `طريقة البدء: ${topic.approach}`,
          `خطوات الموضوع: ${topic.steps.join(' | ')}`,
          `اللمسة الإبداعية: ${topic.creativeTwist}`,
          `الناتج المتوقع: ${topic.expectedOutcome}`,
        ].join('\n')
      : '';
    setMessages((current) => [...current, { id: `copilot-user-${Date.now()}`, role: 'user', text: cleanText }]);
    setCopilotQuestion('');
    setIsThinking(true);
    try {
      const response = await fetchWithTimeout('/api/fahim/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: cleanText,
          lesson: fixedLessonTitle,
          concept: activeSection.title,
          context: [
            'السؤال قادم من كوبيلوت الموضوع داخل مساحة الدرس.',
            generatedLesson?.objective ? `هدف الدرس: ${generatedLesson.objective}` : '',
            sourceExcerpt ? `المكتسب المرتبط حاليًا: ${sourceExcerpt}` : '',
            topicContext,
            `عدد مكتسبات قاعدة المعرفة المتاحة: ${foundationalSources.length}`,
          ].filter(Boolean).join('\n'),
          topicContext,
        }),
      });
      const payload = await response.json() as { answer?: string; message?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.message || 'تعذر رد فهيم');
      setMessages((current) => [...current, { id: `copilot-answer-${Date.now()}`, role: 'assistant', text: payload.answer as string }]);
    } catch {
      openChatCircuit();
    } finally {
      setIsThinking(false);
    }
  };

  const askAboutCreativeTopic = (topic: CreativeIdea) => {
    setSelectedCreativeTopic(topic);
    void askCopilotQuestion(`ساعدني في فهم موضوع «${topic.title}» وابدأ معي بالخطوة الأولى.`, topic);
  };

  const generateCreativeTopic = async () => {
    if (!ragReady || isThinking || chatCircuitOpen) return;
    setActivePartner('exercises');
    setIsThinking(true);
    try {
       const response = await fetchWithTimeout('/api/lesson/exercise', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lesson: fixedLessonTitle,
          level: '3AS',
          activeConcept: activeSection.title,
           mode: 'creative_topic',
           attemptContext: [
             'حوّل الموضوع إلى تطبيقات إبداعية قابلة للدراسة الآن، لا إلى أفكار عامة فقط.',
             generatedLesson?.objective ? `هدف الدرس: ${generatedLesson.objective}` : '',
             sourceExcerpt,
           ].filter(Boolean).join('\n'),
        }),
      });
      const payload = await response.json() as Partial<CreativeIdeasResponse> & { message?: string };
      if (!response.ok || payload.status !== 'generated' || !payload.solutionSummary || !Array.isArray(payload.ideas) || payload.ideas.length < 3 || payload.grounding?.status !== 'ready') {
        throw new Error(payload.message || 'تعذر توليد المسارات الإبداعية');
      }
      setCreativeIdeas(payload as CreativeIdeasResponse);
        setMessages((current) => [...current, {
        id: `topic-creative-${Date.now()}`,
        role: 'assistant',
         text: `بنى لك وكيل التمارين ${(payload as CreativeIdeasResponse).ideas.length} موضوعات مختلفة من مصادر المنهاج. ستجدها في بطاقة التمرين الإبداعي أدناه.`,
      }]);
    } catch {
      openChatCircuit();
    } finally {
      setIsThinking(false);
    }
  };

  useEffect(() => {
    if (!ragReady || lessonGenerationState !== 'idle') return;
    void generateLesson();
  }, [activeSection.id, ragReady]);

  useEffect(() => {
    if (!agentsAvailable) return;
    setMessages((current) => current.some((message) => message.id === 'knowledge-ready')
      ? current
      : [...current, {
          id: 'knowledge-ready',
          role: 'assistant',
          text: activeSource
            ? 'فتحت لك مرجعًا من المنهاج لدرس «قوانين نيوتن والحركة». يمكنك البدء من اللوح أو سؤال دليل عن أي خطوة.'
            : 'فتحت لك بطاقات المعرفة الحقيقية. ابدأ من الفكرة الحالية، وسأربط كل سؤال بالمصادر المتاحة.',
        }]);
  }, [agentsAvailable, activeSource]);

  const askFahim = async (text: string) => {
    if (!faheemActive || !ragReady || chatCircuitOpen) return;
    const cleanText = text.trim();
    if (!cleanText) return;
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text: cleanText }]);
    setQuestion('');
    setIsThinking(true);
    const pausedContext = session.pausedMoment
      ? `توقف الشرح عند الثانية ${Math.round(session.pausedMoment.second)} من عرض «${session.pausedMoment.lessonTitle}». المقطع الموقوف: ${session.pausedMoment.explanation}`
      : '';
    try {
      const response = await fetchWithTimeout('/api/fahim/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: cleanText,
          lesson: 'قوانين نيوتن والحركة',
          concept: activeSection.title,
            context: [
               activeSource ? `مرجع الدرس الحالي: قوانين نيوتن والحركة — ${activeSource.source} ص ${activeSource.page}\nمقتطف المصدر: ${sourceExcerpt}` : '',
              analysis ? `${analysis.lastCorrectStep} — ${analysis.firstError}` : '',
              highlightedPart ? `الجزء المحدد على اللوح: ${highlightedPart}` : '',
              pausedContext,
              !pausedContext && !highlightedPart ? displayedExplanation : '',
            ].filter(Boolean).join('\n'),
        }),
      });
      const payload = await response.json() as { answer?: string; message?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.message || 'تعذر رد فهيم');
      setMessages((current) => [...current, { id: `answer-${Date.now()}`, role: 'assistant', text: payload.answer as string }]);
    } catch {
      openChatCircuit();
    } finally {
      setIsThinking(false);
    }
  };

  const switchPartner = (partner: ActivePartner) => {
    if (!handoffComplete || partner === activePartner) return;
    setActivePartner(partner);
    setQuestion('');
    setMessages((current) => [...current, {
      id: `partner-switch-${partner}-${Date.now()}`,
      role: 'assistant',
      text: `أصبحت الآن مع ${partnerDetails[partner].name}. ${partnerDetails[partner].prompt}`,
    }]);
  };

  const askPartner = async (text: string) => {
    if (chatCircuitOpen) return;
    if (!handoffComplete) {
      await askFahim(text);
      return;
    }
    const cleanText = text.trim();
    if (!ragReady) return;
    if (!cleanText || queryKnowledgeMutation.isPending) return;
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text: cleanText }]);
    setQuestion('');
    setIsThinking(true);
    try {
       const response = await queryKnowledgeMutation.mutateAsync({
        data: {
          query: cleanText,
           n_results: intensiveExamMode ? 1 : 3,
          subject: 'العلوم الفيزيائية',
        },
      });
      const source = response.results?.[0];
      if (activePartner === 'dalil' && !source) {
        throw new Error('لم أعثر على مادة مطابقة لهذا الجزء؛ لم أعرض شرحًا غير موثوق.');
      }
      const targetedConcept = examMode?.error_concepts[0]?.concept_title;
       const sourceContext = source
         ? `مرجع من «${source.title}» (${source.source} · ص ${source.page}): ${source.summary.slice(0, 360)}`
        : `مرجع الدرس الحالي: ${sourceExcerpt}`;
      let reply = activePartner === 'dalil'
        ? `${intensiveExamMode ? 'خلاصة سريعة' : `من «${source?.title}»`}: ${source?.summary.slice(0, 620)} ${intensiveExamMode ? 'والآن انتقل إلى التطبيق.' : 'ابدأ من هذه الفكرة، ثم قارنها بما يظهر على اللوح.'}`
        : 'سأثبت الفكرة أولًا، ثم أبني لك تطبيقًا مناسبًا لها.';
      if (activePartner === 'exercises') {
        const wantsCreativeTopics = /موضوع|إبداع|فكرة|مسار|تطبيقات مختلفة|زاوية/.test(cleanText);
        const response = await fetchWithTimeout('/api/lesson/exercise', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            lesson: 'قوانين نيوتن والحركة',
            level: '3AS',
            activeConcept: activeSection.title,
            attemptContext: analysis
              ? `${analysis.lastCorrectStep} — ${analysis.firstError}: ${analysis.feedback}`
              : targetedConcept || cleanText,
            ...(wantsCreativeTopics ? { mode: 'creative_topic' } : {}),
          }),
        });
        if (wantsCreativeTopics) {
          const payload = await response.json() as Partial<CreativeIdeasResponse> & { message?: string };
          if (!response.ok || payload.status !== 'generated' || !payload.solutionSummary || !Array.isArray(payload.ideas) || payload.ideas.length < 3 || payload.grounding?.status !== 'ready') {
            throw new Error(payload.message || 'تعذر توليد الحل والموضوعات الإبداعية');
          }
          setCreativeIdeas(payload as CreativeIdeasResponse);
          reply = `بدأ وكيل التمارين بالحل، ثم بنى لك ${(payload as CreativeIdeasResponse).ideas.length} موضوعات مختلفة. اختر واحدًا وابدأ من خطواته.`;
        } else {
          const payload = await response.json() as Partial<GeneratedExercise> & { message?: string };
          if (!response.ok || payload.status !== 'generated' || !payload.prompt || !Array.isArray(payload.sourceNodeIds) || payload.grounding?.status !== 'ready') {
            throw new Error(payload.message || 'تعذر توليد تمرين مؤسس على المعرفة');
          }
          setGeneratedExercise(payload as GeneratedExercise);
          setExerciseAnswer('');
          setExerciseFeedback(null);
          setShowExerciseSolution(false);
          reply = `جهز لك وكيل التمارين تدريبًا على «${(payload as GeneratedExercise).title}». ابدأ بكتابة المعطيات والخطوة الأولى.`;
       }
      }
      setMessages((current) => [...current, {
        id: `partner-answer-${Date.now()}`,
        role: 'assistant',
        text: reply,
      }]);
    } catch {
      openChatCircuit();
    } finally {
      setIsThinking(false);
    }
  };

  const handleQuestionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void (handoffComplete ? askPartner(question) : askFahim(question));
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
          void queryClient.invalidateQueries({ queryKey: getGetErrorBankQueryKey() });
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
      setAttachmentError('اختر صورة بصيغة مناسبة.');
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
      completedExamples: current.completedExamples.filter((id) => !id.startsWith(`${activeSection.id}-`)),
      gradedExamples: Object.fromEntries(Object.entries(current.gradedExamples).filter(([id]) => !id.startsWith(`${activeSection.id}-`))),
    }));
    setGeneratedExercise(null);
    setMessages((current) => [...current, { id: `recovery-${Date.now()}`, role: 'assistant', text: `ثبتنا آخر خطوة صحيحة: «${analysis.lastCorrectStep}». سنبني هذا المفهوم من جديد.` }]);
  };

  const generateExerciseForStudent = async (attemptContext: string) => {
    if (chatCircuitOpen) return;
    if (!ragReady) {
      setMessages((current) => [...current, {
        id: `exercise-not-ready-${Date.now()}`,
        role: 'assistant',
        text: 'لم تجهز مصادر المنهاج بعد. أعد المحاولة بعد لحظات ليُبنى التمرين من محتوى موثوق.',
      }]);
      return;
    }
    setIsThinking(true);
    try {
      const response = await fetchWithTimeout('/api/lesson/exercise', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lesson: 'قوانين نيوتن والحركة',
          level: '3AS',
          activeConcept: activeSection.title,
            attemptContext,
        }),
      });
       const payload = await response.json() as Partial<GeneratedExercise> & { message?: string };
       if (!response.ok || payload.status !== 'generated' || !payload.prompt || !Array.isArray(payload.sourceNodeIds) || payload.grounding?.status !== 'ready') {
        throw new Error(payload.message || 'تعذر توليد تمرين مؤسس على المعرفة');
      }
      setGeneratedExercise(payload as GeneratedExercise);
      setExerciseAnswer('');
      setExerciseFeedback(null);
      setShowExerciseHint(false);
      setShowExerciseSolution(false);
      setMessages((current) => [...current, {
        id: `exercise-${Date.now()}`,
        role: 'assistant',
        text: analysis
          ? 'بنيت لك تمرينًا يعالج موضع الخطأ من الدرس وسجل محاولاتك. ابدأ بكتابة المعطيات والخطوة الأولى.'
          : 'جهزت لك تمرينًا مناسبًا للمفهوم الحالي. حاول وحدك أولًا، ثم اطلب التلميح عند الحاجة.',
      }]);
    } catch {
      openChatCircuit();
    } finally {
      setIsThinking(false);
    }
  };

  const buildExercise = async () => {
    if (!analysis) return;
    await generateExerciseForStudent(`${analysis.lastCorrectStep} — ${analysis.firstError}: ${analysis.feedback}`);
  };

  const reviewGeneratedExercise = () => {
    if (!generatedExercise || !exerciseAnswer.trim()) return;
    const normalized = normalizeAnswer(exerciseAnswer);
    const expected = normalizeAnswer(generatedExercise.answer);
    const isCorrect = Boolean(expected) && (
      normalized === expected
      || normalized.includes(expected)
      || expected.includes(normalized)
    );
    setExerciseFeedback(isCorrect ? 'correct' : 'retry');
    setShowExerciseSolution(false);
    recordAttemptMutation.mutate({
      data: {
        lesson_id: lessonId,
        lesson_title: generatedExercise.lessonTitle,
        concept_id: activeSection.id,
        concept_title: activeSection.title,
        error_tag: isCorrect ? 'correct' : `تمرين مولّد · ${generatedExercise.title}`,
        is_correct: isCorrect,
      },
    }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetSummaryBankQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetLearningScheduleQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetErrorBankQueryKey() });
      },
    });
    setMessages((current) => [...current, {
      id: `exercise-review-${Date.now()}`,
      role: 'assistant',
      text: isCorrect
        ? 'حلّك قريب من الإجابة النموذجية. أحسنت، ثبّت الخطوات ثم جرّب تمرينًا آخر.'
        : 'لم نصل للإجابة بعد. افتح التلميح، ثم أعد كتابة المعطيات والعلاقة قبل مشاهدة الحل.',
    }]);
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
      text: `حددت «${region.label}». اسألني عنه وسأشرح الجزء نفسه خطوة خطوة.`,
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
    drawBoard(
      context,
      rect.width,
      rect.height,
      activeSection.id,
      [...session.whiteboardStrokes, drawingRef.current],
      boardMode,
      highlightedPart,
      Boolean(generatedLesson),
    );
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
    const second = owlVideoRef.current?.currentTime ?? 0;
    setSession((current) => ({
      ...current,
      pausedMoment: {
        second: Number.isFinite(second) ? second : 0,
        lessonTitle: displayedTitle,
        explanation: displayedExplanation,
      },
    }));
    owlVideoRef.current?.pause();
    window.speechSynthesis?.cancel();
    setIsPlaying(false);
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      speechRecognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError('الإملاء الصوتي غير متاح في هذا المتصفح. اكتب سؤالك بدلًا من ذلك.');
      return;
    }
    setVoiceError('');
    const recognition = new Recognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) {
        setQuestion((current) => `${current} ${transcript}`.trim());
      }
    };
    recognition.onerror = () => {
      setVoiceError('لم نلتقط الصوت بوضوح. حاول مرة أخرى أو اكتب سؤالك.');
      setIsListening(false);
      speechRecognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsListening(false);
      speechRecognitionRef.current = null;
    };
    speechRecognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  return (
    <section className="lesson-workspace" dir="rtl" data-testid="lesson-workspace">
      <header className="lesson-workspace-header">
        <div className="lesson-title-block">
          <span className="lesson-kicker"><Sparkles size={13} /> جلسة تثبيت · علوم فيزيائية</span>
          <h1>قوانين نيوتن والحركة</h1>
          <p>فكرة واحدة، محاولة قصيرة، ثم علامة واضحة على ما فهمته.</p>
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
              <button type="button" className="lesson-conclude-button" onClick={() => concludeSession()} disabled={!evaluationComplete || !ragReady} data-testid="button-conclude-lesson">
              <CheckCircle2 size={14} /> إنهاء وحفظ الملخص
              </button>
              {evaluationBlocker && <span className="lesson-evaluation-blocker">{evaluationBlocker}</span>}
            </div>
          )}
        </div>
      </header>

       <div className={`lesson-evaluation-banner ${phase4Active ? 'is-handed-off' : ''}`} role="status" data-testid="card-evaluation-plan">
        <div>
            <span className="lesson-panel-kicker"><Sparkles size={13} /> {phase4Active ? 'اكتملت المرحلة التأسيسية' : 'محتوى الدرس جاهز'}</span>
            <strong>{phase4Active ? 'تابع الشرح والتطبيق بتركيز' : 'ابدأ الدراسة الآن'}</strong>
            <p>{phase4Active ? 'يمكنك متابعة الشرح مع دليل ثم الانتقال إلى التمارين لتثبيت ما تعلمته.' : 'شرح وتمارين مرتبطة بدرس قوانين نيوتن والحركة، دون عناوين تقنية تربك مسارك.'}</p>
        </div>
         <div className="lesson-evaluation-meta">
            <span>{phase4Active ? 'المرحلة التالية' : 'الحالة: دراسة مباشرة'}</span>
            <strong>{phase4Active ? 'شرح + تمارين' : 'المحتوى الدراسي'}</strong>
             <small>{phase4Active ? `اكتمل ${formatSessionTime(session.concludedAt ?? session.startedAt)}` : `${evaluationPlan.windowLabel} · الوقت مفتوح`}</small>
        </div>
      </div>

       {examMode && examMode.mode !== 'standard' && (
         <div className={`lesson-exam-mode-strip ${examMode.mode === 'error_stack' ? 'is-error-stack' : ''}`} role="status" data-testid="card-lesson-exam-mode">
           <div><span className="lesson-panel-kicker"><Sparkles size={13} /> {examMode.label}</span><strong>{examMode.mode === 'error_stack' ? 'التمرين التالي يستهدف موضع الخطأ الأعلى.' : 'كثافة أعلى قبل موعد البكالوريا.'}</strong><p>{examMode.description}</p></div>
           <div className="lesson-exam-mode-meta"><strong>×{examMode.exercise_density}</strong><span>كثافة التمارين</span><small>{Math.max(0, examMode.days_until)} يومًا متبقيًا</small></div>
         </div>
       )}

       <div className={`lesson-grid ${isLessonRailCollapsed ? 'has-collapsed-rail' : ''}`}>
          <aside className={`lesson-panel lesson-path-panel ${isLessonRailCollapsed ? 'is-collapsed' : ''}`} aria-label="مسار إتقان الطالب">
          <div className="lesson-panel-heading">
            <div>
               <span className="lesson-panel-kicker"><BookOpen size={13} /> خريطة الإتقان</span>
               <h2>طريق الفهم</h2>
               <p>نثبت خطوة قبل أن نفتح التي بعدها.</p>
            </div>
             <div className="lesson-rail-tools">
               <span className="lesson-rail-count">{progress}٪</span>
               <button
                 type="button"
                 className="lesson-rail-toggle"
                 onClick={() => setIsLessonRailCollapsed((collapsed) => !collapsed)}
                 aria-label={isLessonRailCollapsed ? 'إظهار مراحل الدرس' : 'طي مراحل الدرس'}
                 aria-expanded={!isLessonRailCollapsed}
                 data-testid="button-toggle-lesson-rail"
               >
                 {isLessonRailCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
               </button>
             </div>
          </div>
          <div className="lesson-progress-meter">
            <div className="lesson-progress-label"><span>تقدم الجلسة</span><strong>{totalCompleted}/{totalExamples}</strong></div>
            <div className="lesson-progress-track" aria-label="نسبة التقدم"><span style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="lesson-path-list">
            {lessonSections.map((section, index) => {
              const active = section.id === activeSection.id;
              const done = session.gradedExamples[`${section.id}-grounded`] === 'correct';
              const source = sourceForSection(section, foundationalSources);
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`lesson-path-item ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                  onClick={() => selectSection(section)}
                   title={isLessonRailCollapsed ? section.label : undefined}
                  aria-current={active ? 'step' : undefined}
                  data-testid={`button-lesson-section-${section.id}`}
                >
                  <span className="lesson-path-node">{done ? <Check size={15} /> : `٠${index + 1}`}</span>
                  <span className="lesson-path-copy"><strong>{section.label}</strong><small>{active ? displayedTitle : section.shortLabel}</small>{source && <em>من {source.source}</em>}</span>
                  {active && <span className="lesson-path-current" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className="lesson-path-note"><Lightbulb size={15} /><span>المحتوى مرتبط ببطاقات المعرفة المصدرية، وتظهر الإحالة عند توفرها.</span></div>
          {knowledgeQuery.isLoading && <p className="lesson-source-status"><LoaderCircle size={13} /> نتحقق من مصادر الدرس...</p>}
          {knowledgeQuery.isError && <p className="lesson-source-status is-error">تعذر تحميل الإحالات؛ بقيت أدوات الجلسة متاحة.</p>}
        </aside>

         <section className="lesson-panel lesson-conversation-panel" aria-label={handoffComplete ? 'التواصل مع شركاء التعلّم' : 'حديثك مع فهيم'}>
           <div className="lesson-panel-heading lesson-conversation-heading">
             <div className="lesson-fahim-chip">
                <span className={`lesson-fahim-avatar ${handoffComplete ? 'is-handoff' : ''}`}><img src={handoffComplete ? (activePartner === 'dalil' ? owlAgentTeal : owlAgentViolet) : (isThinking ? owlAgentViolet : analysisState === 'error' ? owlAgentGold : owlAgentTeal)} alt={handoffComplete ? `${activePartnerDetails.name}، ${activePartnerDetails.role}` : 'فهيم، مساعد تثبيت المفاهيم'} /></span>
                 <span><strong>{handoffComplete ? activePartnerDetails.name : 'فهيم'}</strong><small>{handoffComplete ? activePartnerDetails.role : faheemActive ? 'تفاعل وتغذية راجعة' : 'اكتمل التسليم إلى الشريكين'}</small></span>
             </div>
              <span className={`lesson-live-state ${isThinking || analysisState === 'analyzing' ? 'is-working' : ''}`}><i />{handoffComplete ? (isThinking ? 'يراجع الآن' : 'متاح') : !faheemActive ? 'تم التسليم' : analysisState === 'analyzing' ? 'يحلل الصورة' : isThinking ? 'يكتب الآن' : 'جاهز'}</span>
          </div>
           {handoffComplete && (
             <div className="lesson-agent-switcher" role="tablist" aria-label="اختيار شريك التعلّم">
               {(Object.keys(partnerDetails) as ActivePartner[]).map((partner) => {
                 const details = partnerDetails[partner];
                 const active = activePartner === partner;
                 return (
                   <button
                     key={partner}
                     type="button"
                     role="tab"
                     aria-selected={active}
                     title={details.description}
                      className={`lesson-agent-option ${active ? 'is-active' : ''} ${partner === 'exercises' ? 'is-exercises' : 'is-dalil'}`}
                     onClick={() => switchPartner(partner)}
                     data-testid={`button-switch-agent-${partner}`}
                   >
                      <span className="lesson-agent-option-icon">{partner === 'dalil' ? <Lightbulb size={15} /> : <PenLine size={15} />}</span>
                     <span><strong>{details.name}</strong><small>{details.role}</small></span>
                     {active && <Check size={14} aria-hidden="true" />}
                   </button>
                 );
               })}
             </div>
           )}
           <div className="lesson-messages" aria-live="polite" data-testid="region-fahim-messages">
             {messages.map((message) => (
              <article key={message.id} className={`lesson-message ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`} data-testid={`message-lesson-${message.id}`}>
                 <div className="lesson-message-meta">{message.role === 'assistant' ? <><Sparkles size={11} /> {handoffComplete ? activePartnerDetails.name : 'فهيم'}</> : 'أنت'}<span className="lesson-message-time">{getTimeLabel()}</span></div>
                <p>{message.text}</p>
                 {message.id === 'chat-api-fallback' && <button type="button" className="lesson-generation-error-button" onClick={() => window.location.reload()} data-testid="button-refresh-lesson-chat"><RotateCcw size={12} /> تحديث الصفحة</button>}
              </article>
            ))}
             {activePartner === 'exercises' && creativeIdeas && (
               <article className="lesson-creative-card" data-testid="card-creative-ideas">
                 <div className="lesson-creative-card-head">
                   <div><span><Sparkles size={12} /> وكيل التمارين · موضوعات إبداعية · الحل أولًا</span><strong>{creativeIdeas.lessonTitle}</strong></div>
                   <small>{creativeIdeas.ideas.length} أفكار</small>
                 </div>
                 <p className="lesson-creative-solution">{creativeIdeas.solutionSummary}</p>
                 <div className="lesson-creative-ideas">
                  {creativeIdeas.ideas.map((idea, index) => (
                    <div className={`lesson-creative-idea ${selectedCreativeTopic?.title === idea.title ? 'is-selected' : ''}`} key={`${idea.title}-${index}`}>
                       <div className="lesson-creative-idea-title"><span>{index + 1}</span><strong>{idea.title}</strong></div>
                       <p>{idea.approach}</p>
                       <ol>{idea.steps.map((step, stepIndex) => <li key={`${idea.title}-step-${stepIndex}`}>{step}</li>)}</ol>
                       <div className="lesson-creative-twist"><Lightbulb size={12} /><span><strong>اللمسة الإبداعية:</strong> {idea.creativeTwist}</span></div>
                       <small className="lesson-creative-outcome">ما ستتعلمه: {idea.expectedOutcome}</small>
                      <button type="button" className="lesson-creative-ask" onClick={() => askAboutCreativeTopic(idea)} disabled={isThinking} data-testid={`button-ask-creative-topic-${index + 1}`}>
                        <MessageCircle size={12} /> اسأل التعليم الذكي عن هذا الموضوع
                      </button>
                     </div>
                   ))}
                 </div>
                 <small className="lesson-creative-grounding"><BookOpen size={11} /> مبنية على مصادر المنهاج المسترجعة</small>
               </article>
             )}
          </div>
            <form className={`lesson-composer ${!faheemActive && !handoffComplete ? 'is-disabled' : ''}`} onSubmit={handleQuestionSubmit}>
            <label className="lesson-composer-label" htmlFor="lesson-question"><span>{handoffComplete ? `اكتب إلى ${activePartnerDetails.name}` : 'سؤال أو ملاحظة'}</span><span>العنصر الحالي: {activeSection.label}</span></label>
            <div className="lesson-composer-box">
                <textarea id="lesson-question" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!faheemActive && !handoffComplete} placeholder={handoffComplete ? activePartnerDetails.prompt : faheemActive ? 'مثال: لماذا يستمر الراكب في الحركة؟' : 'اكتمل التسليم إلى دليل ووكيل التمارين'} rows={2} data-testid="input-lesson-question" />
                <button type="button" className={`lesson-icon-button lesson-voice-button ${isListening ? 'is-listening' : ''}`} onClick={toggleVoiceInput} disabled={!lessonToolsActive || (!faheemActive && !handoffComplete) || isThinking} aria-label={isListening ? 'إيقاف الإملاء الصوتي' : 'تسجيل سؤال صوتي'} aria-pressed={isListening} data-testid="button-voice-question">{isListening ? <MicOff size={17} /> : <Mic size={17} />}</button>
                <button type="button" className="lesson-icon-button" onClick={() => attachmentInputRef.current?.click()} disabled={!lessonToolsActive} aria-label="إرفاق صورة الحل" data-testid="button-attach-handwritten"><ImagePlus size={17} /></button>
                <button type="submit" className="lesson-send-button" aria-label={`إرسال السؤال إلى ${handoffComplete ? activePartnerDetails.name : 'فهيم'}`} disabled={(!faheemActive && !handoffComplete) || !question.trim() || isThinking} data-testid="button-send-lesson-question"><Send size={16} /></button>
            </div>
              <input ref={attachmentInputRef} type="file" accept="image/*" onChange={handleAttachment} disabled={!lessonToolsActive} hidden data-testid="input-handwritten-image" />
            {session.attachment && (
              <div className="lesson-attachment" data-testid="status-handwritten-attached">
                <img src={session.attachment} alt="معاينة الحل المكتوب بخط اليد" />
                 <span><strong>{session.attachmentName || 'صورة الحل'}</strong><small>أرسلت إلى فهيم للتحليل</small></span>
                <button type="button" onClick={removeAttachment} aria-label="حذف الصورة المرفقة" data-testid="button-remove-handwritten"><X size={14} /></button>
              </div>
            )}
            {attachmentError && <p className="lesson-field-error" role="alert" data-testid="status-attachment-error">{attachmentError}</p>}
             {voiceError && <p className="lesson-field-error lesson-voice-error" role="alert" data-testid="status-voice-error">{voiceError}</p>}
             {(isThinking || analysisState === 'analyzing') && <div className="lesson-thinking" role="status" data-testid="status-ai-generation"><LoaderCircle size={14} /><span>{analysisState === 'analyzing' ? 'فهيم يقرأ المحاولة ويبحث عن أول خطأ...' : `${handoffComplete ? activePartnerDetails.name : 'فهيم'} يراجع الخطوة...`}</span><i /></div>}
            {analysisState === 'error' && <div className="lesson-analysis-error" role="alert" data-testid="status-attempt-analysis-error"><span>{analysisError}</span><button type="button" onClick={() => { if (session.attachment) void analyzeAttempt(session.attachment, session.attachmentName ?? 'محاولة'); }}>إعادة التحليل</button></div>}
            {analysis && (
              <div className="lesson-analysis-card" data-testid="card-attempt-analysis">
                 <div className="lesson-analysis-header"><strong>قراءة المحاولة خطوة خطوة</strong><span>{recordAttemptMutation.isPending ? 'يحفظ الربط...' : 'أضيفت إلى بنك الأخطاء'}</span></div>
                <div className="lesson-analysis-row is-correct"><span>آخر خطوة صحيحة</span><strong>{analysis.lastCorrectStep}</strong></div>
                <div className="lesson-analysis-row is-error"><span>بداية الخطأ</span><strong>{analysis.firstErrorStep}</strong></div>
                <p>{analysis.feedback}</p>
                <div className="lesson-analysis-actions"><button type="button" onClick={resetToLastCorrect} data-testid="button-reset-to-last-correct"><RotateCcw size={13} /> العودة لآخر خطوة</button><button type="button" onClick={buildExercise} data-testid="button-generate-error-exercise">ابنِ تمرينًا مشابهًا</button></div>
              </div>
            )}
          </form>
        </section>

           <section
             className={`lesson-panel lesson-teaching-panel ${isBoardImmersive ? 'is-immersive' : ''}`}
             aria-label={handoffComplete ? 'مساحة الدرس والتمرين والحل' : 'السبورة الذكية لفهيم'}
             aria-modal={isBoardImmersive ? 'true' : undefined}
             role={isBoardImmersive ? 'dialog' : undefined}
           >
          <div className="lesson-teaching-header">
            <div>
                <span className="lesson-panel-kicker"><Volume2 size={13} /> طبقة 1 · {handoffComplete ? 'لوح الدرس' : 'لوح فهيم'}</span>
               <h2 data-testid="text-current-lesson-title">{displayedTitle}</h2>
               <p>إيقاع مقترح · {activeSection.duration} · {activeSection.label}</p>
                {activeSource && <span className="lesson-source-badge"><BookOpen size={12} /> مصدر مباشر · {activeSource.source} · ص {activeSource.page}</span>}
            </div>
             <div className="lesson-teaching-actions">
                <button
                  type="button"
                  className="lesson-board-expand-button"
                  onClick={() => setIsBoardImmersive((open) => !open)}
                  aria-label={isBoardImmersive ? 'العودة إلى جلسة الدرس' : 'فتح مساحة الشرح كاملة'}
                  aria-expanded={isBoardImmersive}
                  data-testid="button-toggle-immersive-board"
                >
                  {isBoardImmersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  <span>{isBoardImmersive ? 'العودة للجلسة' : 'مساحة شرح كاملة'}</span>
                </button>
               <button
                 type="button"
                 className="lesson-generate-button"
                 onClick={() => void generateLesson()}
                  disabled={!lessonToolsActive || lessonGenerationState === 'generating'}
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
                   onPlay={() => setIsPlaying(true)}
                   onPause={() => setIsPlaying(false)}
                   aria-label="فيديو فهيم أثناء الشرح"
                   data-testid="video-fahim-blackboard"
                 />
                 <span>{handoffComplete ? 'فيديو الشرح' : 'فيديو فهيم'}</span>
              </div>
             </div>
          </div>
            <section className={`lesson-topic-studio ${topicStudioOpen ? 'is-open' : ''}`} aria-label="موضوع الدرس وتوليده">
              <div className="lesson-topic-studio-head">
                <div>
                  <span className="lesson-topic-kicker"><BookOpen size={12} /> موضوع الدرس داخل مساحة التفاعل</span>
                  <h3>موضوع تطبيقي شامل · قوانين نيوتن والحركة</h3>
                  <p>اقرأ المطلوب، اسأل عن أي نقطة، ثم حوّل كل مكتسبات المنهاج إلى تطبيق إبداعي.</p>
                </div>
                <button type="button" className="lesson-topic-toggle" onClick={() => setTopicStudioOpen((open) => !open)} aria-expanded={topicStudioOpen} data-testid="button-toggle-topic-studio">
                  {topicStudioOpen ? 'طي الموضوع' : 'عرض الموضوع'}
                </button>
              </div>
              {topicStudioOpen && (
                <div className="lesson-topic-studio-body">
                  <div className="lesson-topic-meta">
                    <span>المستوى: السنة الثالثة ثانوي</span>
                    <span>النمط: موضوع + تعلم ذكي</span>
                    <span>{foundationalSources.length || '—'} مكتسبات مرتبطة بالمصادر</span>
                  </div>
                  <div className="lesson-topic-brief">
                    <div><strong>المطلوب</strong><span>فسّر القصور الذاتي والقوة المحصلة، اربطهما بالتسارع، ثم طبّق القوانين على وضعية حركة واقعية.</span></div>
                    <div><strong>طريقة العمل</strong><span>ابدأ بالمعطيات، اكتب القانون المناسب، برّر النتيجة، واطلب من فهيم توضيح أي خطوة.</span></div>
                    <div><strong>التثبيت</strong><span>اختر مفهومًا من خريطة الإتقان في الطبقة الثالثة لتفتح مثالًا وتمرينًا مرتبطين به.</span></div>
                  </div>
                  <div className="lesson-topic-actions">
                    <button type="button" className="lesson-topic-primary" onClick={() => void generateCreativeTopic()} disabled={!lessonToolsActive || isThinking || chatCircuitOpen} data-testid="button-generate-topic-creative">
                      {isThinking ? <LoaderCircle size={13} className="lesson-spin-icon" /> : <Sparkles size={13} />} ولّد تطبيقات إبداعية من كل المكتسبات
                    </button>
                    <button type="button" className="lesson-topic-secondary" onClick={() => setLocation('/exam-preview')} data-testid="button-open-full-topic">
                      <BookOpen size={13} /> فتح الموضوع الكامل
                    </button>
                  </div>
                  <form className="lesson-copilot-form" onSubmit={(event) => { event.preventDefault(); void askCopilotQuestion(copilotQuestion); }}>
                    <div>
                      <span className="lesson-copilot-label"><MessageCircle size={13} /> سؤال الكوبيلوت</span>
                     <small>{selectedCreativeTopic ? `الموضوع المحدد: ${selectedCreativeTopic.title}` : 'اسأل عن الموضوع أو عن أي خطوة فيه'}</small>
                    </div>
                    <input value={copilotQuestion} onChange={(event) => setCopilotQuestion(event.target.value)} disabled={!lessonToolsActive || isThinking || chatCircuitOpen} placeholder="مثال: كيف أختار القانون المناسب في الوضعية؟" aria-label="سؤال الكوبيلوت عن الموضوع" data-testid="input-topic-copilot-question" />
                    <button type="submit" disabled={!lessonToolsActive || !copilotQuestion.trim() || isThinking || chatCircuitOpen} aria-label="إرسال سؤال الكوبيلوت" data-testid="button-send-topic-copilot"><Send size={15} /></button>
                  </form>
                </div>
              )}
            </section>
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
                    <h3>{fixedLessonTitle}</h3>
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
                  <p><strong>سؤال للتفكير:</strong> {generatedLesson.prompt}</p>
                 {generatedLesson.sourceDocuments.length > 0 && (
                   <div className="lesson-generated-sources">
                     <BookOpen size={12} />
                     <span>المراجع: {generatedLesson.sourceDocuments.slice(0, 3).map((source) => `${source.source} · ص ${source.page}`).join('، ')}</span>
                   </div>
                 )}
               </div>
             </div>
           )}
           <div className="lesson-explanation">
            <span className="lesson-explanation-label">فكرة مركزيّة</span>
             <p>{displayedExplanation.replace(`${displayedHighlight} `, '')} <button type="button" className={`lesson-highlight-part ${highlightedPart === displayedHighlight ? 'is-selected' : ''}`} onClick={() => { pauseNarration(); setHighlightedPart(displayedHighlight); }} aria-pressed={highlightedPart === displayedHighlight} data-testid="button-highlight-concept">{displayedHighlight}</button></p>
            {activeSource && <div className="lesson-source-line"><BookOpen size={13} /><span>مرجع هذا الجزء</span><small>{activeSource.source} · ص {activeSource.page}</small></div>}
              <button type="button" className="lesson-ask-highlight" onClick={() => { if (highlightedPart) void (handoffComplete ? askPartner(`اشرح لي الجزء المحدد: ${highlightedPart}`) : askFahim(`اشرح لي الجزء المحدد: ${highlightedPart}`)); }} disabled={!lessonToolsActive || !highlightedPart} data-testid="button-ask-highlighted"><Highlighter size={13} /> اسأل عن الجزء المحدد</button>
          </div>
          <div className="lesson-whiteboard-wrap">
            <div className="lesson-whiteboard-toolbar">
                <span><BarChart3 size={14} /> لوح الدرس · انقري على الجزء غير الواضح</span>
              <div>
                <button type="button" className={boardMode === 'pen' ? 'is-selected' : ''} onClick={() => setBoardMode('pen')} disabled={!lessonToolsActive} aria-label="أداة الكتابة" data-testid="button-whiteboard-pen"><PenLine size={15} /></button>
                  <button type="button" className={boardMode === 'highlight' ? 'is-selected' : ''} onClick={() => setBoardMode('highlight')} disabled={!lessonToolsActive} aria-label="أداة التظليل والنقر" data-testid="button-whiteboard-highlight"><Highlighter size={15} /></button>
                 <button type="button" onClick={clearBoard} disabled={!lessonToolsActive} aria-label="مسح الكتابة" data-testid="button-whiteboard-clear"><Eraser size={15} /></button>
              </div>
            </div>
            <div className="lesson-canvas-shell">
                <canvas ref={canvasRef} className={`lesson-whiteboard-canvas ${boardMode === 'highlight' ? 'is-highlighting' : ''} ${!lessonToolsActive ? 'is-locked' : ''}`} onPointerDown={lessonToolsActive ? (boardMode === 'highlight' ? selectBoardRegion : startDrawing) : undefined} onPointerMove={lessonToolsActive && boardMode === 'pen' ? continueDrawing : undefined} onPointerUp={lessonToolsActive && boardMode === 'pen' ? finishDrawing : undefined} onPointerCancel={lessonToolsActive && boardMode === 'pen' ? finishDrawing : undefined} aria-label="لوح تفاعلي للكتابة والرسم والتحديد" data-testid="canvas-lesson-whiteboard" />
               <div className="lesson-board-hotspots" aria-label="مناطق اللوح القابلة للتحديد">
                 {hotspots.map((region) => (
                   <button
                     key={region.id}
                     type="button"
                     className={highlightedPart === region.label ? 'is-selected' : ''}
                     style={{ left: region.left, top: region.top, width: region.width }}
                        onClick={() => { if (!lessonToolsActive) return; pauseNarration(); setBoardMode('highlight'); setHighlightedPart(region.label); }}
                       disabled={!lessonToolsActive}
                     aria-pressed={highlightedPart === region.label}
                     aria-label={`تحديد ${region.label}`}
                     data-testid={`button-board-region-${region.id}`}
                   >
                     <span>{region.label}</span>
                   </button>
                 ))}
               </div>
              <span className="lesson-canvas-hint">{activeSection.id === 'graph' ? 'الميل يروي قصة الحركة' : 'اكتب أو ارسم فوق اللوح'}</span>
            </div>
          </div>
          <div className="lesson-teaching-footer">
            <div className="lesson-narration" role="status" aria-live="polite">
                <button type="button" className="lesson-play-button" onClick={toggleNarration} disabled={!lessonToolsActive} aria-label={isPlaying ? 'إيقاف الشرح الصوتي' : 'تشغيل الشرح الصوتي'} data-testid="button-toggle-narration">{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
                 <div className="lesson-narration-copy"><strong>{isPlaying ? `${handoffComplete ? activePartnerDetails.name : 'فهيم'} يشرح لك بالصوت...` : 'الشرح الصوتي جاهز'}</strong><span>{isPlaying ? displayedExplanation : 'شغّل العرض وصوته، ثم أوقفه واسأل عن أي لحظة.'}</span><div className="lesson-narration-progress"><span style={{ width: `${narrationProgress}%` }} /></div></div>
            </div>
              <form className={`lesson-board-question ${!lessonToolsActive || chatCircuitOpen ? 'is-disabled' : ''}`} onSubmit={(event) => { event.preventDefault(); void (handoffComplete ? askPartner(question || `ساعدني في فهم ${activeSection.label}`) : askFahim(question || `ساعدني في فهم ${activeSection.label}`)); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!lessonToolsActive || chatCircuitOpen} placeholder={handoffComplete ? `اكتب إلى ${activePartnerDetails.name} عن اللوح` : faheemActive ? 'اسأل فهيم عن اللوح' : 'اكتمل التسليم إلى الشريكين'} aria-label={`سؤال ${handoffComplete ? activePartnerDetails.name : 'فهيم'} عن اللوح`} data-testid="input-board-question" /><button type="submit" disabled={!lessonToolsActive || chatCircuitOpen} aria-label="إرسال سؤال اللوح" data-testid="button-send-board-question"><MessageCircle size={15} /></button></form>
          </div>
          <div className="lesson-examples">
             <div className="lesson-examples-heading">
               <div>
                 <h3>تثبيت سريع</h3>
                 <span>{completedCount} / {activeExamples.length}</span>
               </div>
               <button
                 type="button"
                 className="lesson-generate-exercise-button"
                 onClick={() => void generateExerciseForStudent(`تمرين مباشر على مفهوم ${activeSection.title}`)}
                  disabled={!lessonToolsActive || isThinking || chatCircuitOpen}
                 data-testid="button-generate-student-exercise"
               >
                 {isThinking ? <LoaderCircle size={12} className="lesson-spin-icon" /> : <Sparkles size={12} />}
                 {isThinking ? 'يُحضّر...' : 'تمرين الآن'}
               </button>
             </div>
             <p className="lesson-examples-hint">اكتب إجابة قصيرة لكل مثال، ثم تحقق منها. لا نحتسب الفهم إلا بعد إجابة صحيحة.</p>
             <div className="lesson-example-list">
              {activeExamples.map((example) => {
                const status = session.gradedExamples[example.id];
                const done = status === 'correct';
                return (
                  <div key={example.id} className={`lesson-example ${done ? 'is-done' : status === 'incorrect' ? 'is-incorrect' : ''}`} data-testid={`card-practical-example-${example.id}`}>
                    <div className="lesson-example-heading">
                      <span className="lesson-example-check">{done ? <Check size={13} /> : status === 'incorrect' ? <X size={13} /> : <span>{activeExamples.indexOf(example) + 1}</span>}</span>
                      <span className="lesson-example-copy"><strong>{example.title}</strong><small>{example.detail}</small></span>
                    </div>
                    <textarea
                      value={session.exampleAnswers[example.id] ?? ''}
                      onChange={(event) => setSession((current) => ({
                        ...current,
                        exampleAnswers: { ...current.exampleAnswers, [example.id]: event.target.value },
                      }))}
                      placeholder="اكتب إجابتك هنا..."
                      aria-label={`إجابة ${example.title}`}
                      rows={2}
                       disabled={!lessonToolsActive}
                      data-testid={`input-example-answer-${example.id}`}
                    />
                    <div className="lesson-example-footer">
                      <small className={`lesson-example-status ${status === 'incorrect' ? 'is-incorrect' : done ? 'is-correct' : ''}`}>
                        {done ? 'إجابة صحيحة · أُضيفت للإتقان' : status === 'incorrect' ? 'راجع الفكرة وحاول مرة أخرى' : 'بانتظار إجابتك'}
                      </small>
                       <button type="button" onClick={() => gradeExample(example.id)} disabled={!lessonToolsActive || !session.exampleAnswers[example.id]?.trim()} data-testid={`button-complete-example-${example.id}`}>
                        {status ? 'تحقق مجددًا' : 'تحقق من الإجابة'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
           {generatedExercise && (
             <div className="lesson-generated-exercise" data-testid="card-generated-error-exercise">
                <span>{analysis ? 'تمرين إضافي يعالج نفس الخطأ' : 'تمرينك الآن · جرّب قبل كشف الحل'}</span>
               <h4>{generatedExercise.title}</h4>
               <p>{generatedExercise.prompt}</p>
               <small>بُني من محتوى درس قوانين نيوتن والحركة</small>
                <textarea
                  value={exerciseAnswer}
                  onChange={(event) => {
                    setExerciseAnswer(event.target.value);
                    setExerciseFeedback(null);
                  }}
                  placeholder="اكتب محاولتك هنا قبل فتح التلميح..."
                  aria-label="إجابة التمرين المولّد"
                  rows={2}
                  data-testid="input-generated-exercise-answer"
                />
                <div className="lesson-generated-exercise-actions">
                  <button
                    type="button"
                    onClick={reviewGeneratedExercise}
                    disabled={!exerciseAnswer.trim() || recordAttemptMutation.isPending}
                    data-testid="button-check-generated-exercise"
                  >
                    {exerciseFeedback === 'correct' ? 'إجابة صحيحة' : 'تحقق من إجابتي'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExerciseHint((visible) => !visible)}
                    data-testid="button-toggle-generated-hint"
                  >
                    {showExerciseHint ? 'إخفاء التلميح' : 'أعطني تلميحًا'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExerciseSolution((visible) => !visible)}
                    data-testid="button-toggle-generated-solution"
                  >
                    {showExerciseSolution ? 'إخفاء الحل' : 'إظهار الحل خطوة خطوة'}
                  </button>
                </div>
                {exerciseFeedback && <p className={`lesson-generated-feedback ${exerciseFeedback === 'correct' ? 'is-correct' : 'is-retry'}`}>{exerciseFeedback === 'correct' ? 'أحسنت، إجابتك تطابق الفكرة المطلوبة.' : 'راجع المعطيات والخطوة الأولى، ثم حاول مرة أخرى.'}</p>}
                {showExerciseHint && <p className="lesson-generated-hint"><strong>تلميح:</strong> {generatedExercise.hint}</p>}
                {showExerciseSolution && <p className="lesson-generated-solution">{generatedExercise.solution}</p>}
             </div>
           )}
          </div>
          <div className="lesson-note-card">
            <div className="lesson-note-header"><strong><Save size={13} /> ملاحظتك</strong><span>{noteStatus}</span></div>
            <textarea value={session.note} onChange={(event) => { setNoteStatus('يُحفظ الآن'); setSession((current) => ({ ...current, note: event.target.value })); }} placeholder="اكتب علاقة تريد تذكرها..." aria-label="ملاحظة الدرس" data-testid="input-lesson-note" />
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
               {summaryPreview.progress === 100 && summarySaveState === 'saved' && <button type="button" className="lesson-unit-quiz-button" onClick={() => setLocation('/quizzes?quiz=mechanics-unit')} data-testid="button-start-unit-assessment"><Sparkles size={14} /> افتح تقييم الوحدة عالي الصعوبة</button>}
             </div>}
            {attemptBank.length > 0 && <div className="lesson-bank"><div className="lesson-bank-heading"><strong>بنك الأخطاء</strong><span>{attemptBank.length} محاولات</span></div>{attemptBank.slice(0, 2).map((item) => <button type="button" key={item.id} className="lesson-bank-item" onClick={() => { setAnalysis(item); setAnalysisState('ready'); }} data-testid={`button-open-attempt-${item.id}`}><span>{item.fileName}</span><small>{item.createdAt} · {item.summaryAnchor}</small></button>)}</div>}
          </div>
        </section>
      </div>
    </section>
  );
}