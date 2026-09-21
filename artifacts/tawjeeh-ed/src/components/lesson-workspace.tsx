import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  Download,
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
  ScanSearch,
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
  type WhiteboardAsset,
} from '@workspace/api-client-react';
import { getAgentReadinessQueryOptions } from '@/lib/agent-readiness';
import owlAgentGold from '@assets/agent-success-cropped.png';
import owlAgentMint from '@assets/agent-guiding-cropped.png';
import owlAgentTeal from '@assets/agent-creation-cropped.png';
import owlAgentViolet from '@assets/agent-thinking-cropped.png';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';
import owlThinkingVideo from '@assets/Owl_mascot_thinking_and_solving_202609022335_1788425680408.mp4';
import { useAppUser } from '@/lib/app-auth';
import { InteractiveLearningLoop, type LessonBoardSync } from '@/components/interactive-learning-loop';
import { InteractiveWhiteboard, type WhiteboardCanvasCommand, type WhiteboardImage, type WhiteboardSelection } from '@/components/interactive-whiteboard';
import { WhiteboardOwlCopilot, type WhiteboardOwlState, type WhiteboardOwlTarget } from '@/components/whiteboard-owl-copilot';
import { PaperAttemptCopilot } from '@/components/paper-attempt-copilot';
import { emitOwlSyncEvent } from '@/hooks/useOwlSync';
import { useLocation } from 'wouter';
import { fetchWithTimeout } from '@/lib/request';
import { MathText } from '@/components/math-text';
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
type BoardMode = 'pen' | 'highlight' | 'select';
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

type CopilotInteraction = {
  id: string;
  sectionId: LessonSectionId;
  question: string;
  answer: string;
  selection: Omit<WhiteboardSelection, 'imageDataUrl'>;
  createdAt: string;
};

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
  errorArea: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  };
};

type FahimWhiteboardAction = {
  action: 'draw_diagram' | 'type_text' | 'highlight_area';
  details: Record<string, unknown>;
};

type FahimResponse = {
  speech_text: string;
  chat_response: string;
  whiteboard_actions: FahimWhiteboardAction[];
  evaluated_skill: string;
  mastery_score: number;
};

type FahimPayload = {
  fahim?: Partial<FahimResponse>;
  answer?: string;
  message?: string;
};

type DaleelResponse = {
  speech_text: string;
  canvas_commands: WhiteboardCanvasCommand[];
  summary_data: {
    title: string;
    key_takeaways: string[];
    official_stamp_applied: boolean;
  };
};

type SpeechBoundary = {
  start: number;
  end: number;
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
  format?: 'comprehensive_function' | 'comprehensive_science';
  totalPoints?: number;
  sections?: Array<{
    id: string;
    title: string;
    points: number;
    prompt: string;
  }>;
  fallback?: boolean;
  fallbackMessage?: string;
};

type CreativeIdea = {
  title: string;
  approach: string;
  steps: string[];
  creativeTwist: string;
  expectedOutcome: string;
  sourceNodeIds: string[];
  situation?: string;
  data?: string;
  required?: string;
  challenge?: string;
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
  fallback?: boolean;
  fallbackMessage?: string;
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
  whiteboardStrokesBySection: Partial<Record<LessonSectionId, Point[][]>>;
  whiteboardImagesBySection: Partial<Record<LessonSectionId, WhiteboardImage>>;
  flowNotes: Partial<Record<LessonSectionId, string>>;
  startedAt: string;
  concludedAt: string | null;
  evaluationMode: EvaluationMode;
  activeAgent: ActiveAgent;
  evaluationCompletedAt: string | null;
  pausedMoment: { second: number; lessonTitle: string; explanation: string } | null;
  copilotInteractions: CopilotInteraction[];
};

type LocalSummary = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  subject: string;
  summary: string;
  concepts: { id: string; title: string; summary: string; mastery: number }[];
  whiteboard_assets: WhiteboardAsset[];
  startedAt: string;
  completedAt: string;
  progress: number;
  officialStamp: string;
  officialStampApplied: boolean;
  summaryTitle: string;
  keyTakeaways: string[];
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
     duration: '3 دقائق',
    title: 'ما الذي يغيّر الحركة؟',
    explanation: 'الجسم يحافظ على حالته من السكون أو الحركة المنتظمة ما لم تؤثر فيه قوة محصلة.',
    highlight: 'يحافظ على حالته',
    prompt: 'ابدأ بتحديد معنى القصور الذاتي بكلماتك.',
  },
  {
    id: 'worked-example',
    label: 'مثال محلول',
    shortLabel: 'نطبّق الفكرة',
     duration: '8 دقائق',
    title: 'مثال من الحافلة',
    explanation: 'عند توقف الحافلة فجأة يستمر جسم الراكب في الحركة إلى الأمام، لأن حالته الحركية لم تتغير لحظيًا.',
    highlight: 'يستمر جسم الراكب في الحركة',
    prompt: 'تتبع الخطوة الأولى في المثال قبل كتابة العلاقة.',
  },
  {
    id: 'graph',
    label: 'تمثيل بياني',
    shortLabel: 'نرى العلاقة',
     duration: '6 دقائق',
    title: 'الحركة على الرسم',
    explanation: 'يمثل ميل منحنى الموضع بدلالة الزمن السرعة، بينما يكشف تغير الميل عن تغير الحركة.',
    highlight: 'ميل منحنى الموضع',
    prompt: 'اختر نقطة على المنحنى واسأل: ماذا يخبرنا الميل هنا؟',
  },
  {
    id: 'practice',
    label: 'تدريب',
    shortLabel: 'جرّب بنفسك',
     duration: '10 دقائق',
    title: 'قوة محصلة، خطوة خطوة',
    explanation: 'القوة المحصلة هي مجموع القوى المؤثرة، واتجاهها هو الذي يحدد تغير الحركة.',
    highlight: 'مجموع القوى المؤثرة',
    prompt: 'اكتب القوى المعطاة واتجاه كل قوة قبل الحساب.',
  },
  {
    id: 'recap',
    label: 'خلاصة',
    shortLabel: 'نثبت المكتسب',
     duration: '4 دقائق',
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

function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
const defaultExamDate = `${new Date().getFullYear() + 1}-06-07`;
const currentLessonTopicKey = 'tawjeeh.lesson.current-topic.v1';
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
    description: 'يفكك الفكرة ويصلها بتطبيقات المنهاج.',
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
    whiteboardStrokesBySection: {},
    whiteboardImagesBySection: {},
    flowNotes: {},
    startedAt: new Date().toISOString(),
    concludedAt: null,
    evaluationMode: defaultEvaluationMode,
    activeAgent: 'faheem',
    evaluationCompletedAt: null,
    pausedMoment: null,
    copilotInteractions: [],
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
      whiteboardStrokesBySection: parsed.whiteboardStrokesBySection && typeof parsed.whiteboardStrokesBySection === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.whiteboardStrokesBySection)
              .filter(([key, value]) => lessonSections.some((section) => section.id === key) && Array.isArray(value))
              .map(([key, value]) => [
                key,
                (value as unknown[]).filter((stroke): stroke is Point[] => Array.isArray(stroke) && stroke.every((point) => typeof point?.x === 'number' && typeof point?.y === 'number')),
              ]),
          ) as Partial<Record<LessonSectionId, Point[][]>>
        : parsed.whiteboardStrokes?.length
          ? { [active]: parsed.whiteboardStrokes }
          : {},
      whiteboardImagesBySection: parsed.whiteboardImagesBySection && typeof parsed.whiteboardImagesBySection === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.whiteboardImagesBySection)
              .filter(([key, value]) => lessonSections.some((section) => section.id === key)
                && value
                && typeof value === 'object'
                && typeof (value as { dataUrl?: unknown }).dataUrl === 'string'
                && typeof (value as { fileName?: unknown }).fileName === 'string')
              .map(([key, value]) => [key, value]),
          ) as Partial<Record<LessonSectionId, WhiteboardImage>>
        : {},
      flowNotes: parsed.flowNotes && typeof parsed.flowNotes === 'object'
        ? Object.fromEntries(Object.entries(parsed.flowNotes).filter(([key, value]) => lessonSections.some((section) => section.id === key) && typeof value === 'string')) as Partial<Record<LessonSectionId, string>>
        : {},
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
      copilotInteractions: Array.isArray(parsed.copilotInteractions)
        ? parsed.copilotInteractions.filter((item): item is CopilotInteraction => Boolean(
            item
            && typeof item === 'object'
            && typeof item.id === 'string'
            && lessonSections.some((section) => section.id === item.sectionId)
            && typeof item.question === 'string'
            && typeof item.answer === 'string'
            && typeof item.createdAt === 'string'
            && item.selection
            && typeof item.selection.x === 'number'
            && typeof item.selection.y === 'number'
            && typeof item.selection.width === 'number'
            && typeof item.selection.height === 'number'
            && item.selection.shape === 'rectangle',
          )).slice(-12)
        : [],
    };
  } catch {
    return fallback;
  }
}

function readCurrentLessonTopic(): { title: string; subject: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(currentLessonTopicKey) || '{}') as {
      title?: unknown;
      subject?: unknown;
    };
    if (typeof parsed.title !== 'string' || !parsed.title.trim()) return null;
    return {
      title: parsed.title.trim(),
      subject: typeof parsed.subject === 'string' && parsed.subject.trim()
        ? parsed.subject.trim()
        : 'العلوم الفيزيائية',
    };
  } catch {
    return null;
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

function saveOfficialSummaryToProfile(summary: LocalSummary) {
  if (!summary.officialStampApplied || summary.progress < 100) return;
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

export function LessonWorkspace() {
  const [currentLessonTopic] = useState(readCurrentLessonTopic);
  const fixedLessonTitle = currentLessonTopic?.title ?? 'قوانين نيوتن والحركة';
  const fixedLessonSubject = currentLessonTopic?.subject ?? 'العلوم الفيزيائية';
  const [, setLocation] = useLocation();
  const { user } = useAppUser();
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
  const [creativeTopicError, setCreativeTopicError] = useState('');
  const [selectedCreativeTopic, setSelectedCreativeTopic] = useState<CreativeIdea | null>(null);
  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [topicStudioOpen, setTopicStudioOpen] = useState(true);
  const [isTopicImmersive, setIsTopicImmersive] = useState(false);
  const [selectedTopicExcerpt, setSelectedTopicExcerpt] = useState('');
  const [topicAnalysis, setTopicAnalysis] = useState('');
  const [topicCompletionState, setTopicCompletionState] = useState<'idle' | 'analyzing' | 'advanced' | 'error'>('idle');
  const [generatedLesson, setGeneratedLesson] = useState<GeneratedLesson | null>(null);
  const [lessonGenerationState, setLessonGenerationState] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [lessonGenerationError, setLessonGenerationError] = useState('');
  const [summarySaveState, setSummarySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [summaryPreview, setSummaryPreview] = useState<LocalSummary | null>(null);
  const [boardMode, setBoardMode] = useState<BoardMode>('pen');
  const [boardSelection, setBoardSelection] = useState<WhiteboardSelection | null>(null);
  const [boardCopilotOpen, setBoardCopilotOpen] = useState(false);
  const [whiteboardOwlState, setWhiteboardOwlState] = useState<WhiteboardOwlState>('idle');
  const [boardCopilotQuestion, setBoardCopilotQuestion] = useState('');
  const [boardCopilotAnswer, setBoardCopilotAnswer] = useState('');
  const [boardCopilotState, setBoardCopilotState] = useState<'idle' | 'asking' | 'answered' | 'error'>('idle');
  const [boardCopilotError, setBoardCopilotError] = useState('');
  const [isBoardCopilotListening, setIsBoardCopilotListening] = useState(false);
  const [daleelResponse, setDaleelResponse] = useState<DaleelResponse | null>(null);
  const [daleelCanvasCommands, setDaleelCanvasCommands] = useState<WhiteboardCanvasCommand[]>([]);
  const masterySummaryRequestedRef = useRef(false);
  const [fahimResponse, setFahimResponse] = useState<FahimResponse | null>(null);
  const [fahimBoardTarget, setFahimBoardTarget] = useState<WhiteboardOwlTarget | null>(null);
  const [isBoardImmersive, setIsBoardImmersive] = useState(false);
  const [isLessonRailCollapsed, setIsLessonRailCollapsed] = useState(false);
  const [roadmapSync, setRoadmapSync] = useState<LessonBoardSync | null>(null);
  const [activePartner, setActivePartner] = useState<ActivePartner>('dalil');
  const [exerciseAttemptImage, setExerciseAttemptImage] = useState<string | null>(null);
  const [exerciseAttemptName, setExerciseAttemptName] = useState('');
  const [exerciseAttemptState, setExerciseAttemptState] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [exerciseAttemptError, setExerciseAttemptError] = useState('');
  const [exerciseAttemptStartedAt, setExerciseAttemptStartedAt] = useState<number | null>(null);
  const [exerciseAttemptElapsed, setExerciseAttemptElapsed] = useState(0);
  const [paperCopilotOpen, setPaperCopilotOpen] = useState(false);
  const [paperCopilotQuestion, setPaperCopilotQuestion] = useState('');
  const [paperCopilotAnswer, setPaperCopilotAnswer] = useState('');
  const [paperCopilotState, setPaperCopilotState] = useState<'idle' | 'asking' | 'error'>('idle');
  const [paperCopilotError, setPaperCopilotError] = useState('');
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const whiteboardImageInputRef = useRef<HTMLInputElement>(null);
  const owlVideoRef = useRef<HTMLVideoElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const copilotSpeechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => {
    if (!exerciseAttemptStartedAt || exerciseAttemptState === 'ready' || exerciseAttemptState === 'error') return;
    const updateElapsed = () => setExerciseAttemptElapsed(Math.max(0, Math.floor((Date.now() - exerciseAttemptStartedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [exerciseAttemptStartedAt, exerciseAttemptState]);
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
  const activeBoardImage = session.whiteboardImagesBySection[activeSection.id] ?? null;
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
  const narrationText = daleelResponse?.speech_text || displayedExplanation;
  const narrationBoundaries = useMemo<SpeechBoundary[]>(() => {
    const boundaries: SpeechBoundary[] = [];
    const sentencePattern = /[^.!؟؛:\n]+(?:[.!؟؛:]|$)/g;
    for (const match of narrationText.matchAll(sentencePattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (match[0].trim()) boundaries.push({ start, end });
    }
    return boundaries;
  }, [narrationText]);
  const visibleDaleelCanvasCommands = useMemo(() => {
    if (!daleelResponse || !isPlaying || daleelCanvasCommands.length === 0) return daleelCanvasCommands;
    const finalStep = Math.max(...daleelCanvasCommands.map((command) => command.step), 1);
    const currentStep = Math.max(1, Math.ceil((narrationProgress / 100) * finalStep));
    return daleelCanvasCommands.filter((command) => command.step <= currentStep);
  }, [daleelCanvasCommands, daleelResponse, isPlaying, narrationProgress]);
  const topicForStudio = selectedCreativeTopic ?? creativeIdeas?.ideas[0] ?? null;
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
  const whiteboardAssets = useMemo<WhiteboardAsset[]>(() => {
    const strokes = lessonSections.flatMap((section) => (session.whiteboardStrokesBySection[section.id] ?? []).map((points, index) => ({
      id: `${lessonId}:${section.id}:stroke:${index}`,
      kind: 'stroke' as const,
      section_id: section.id,
      label: `رسم ${index + 1} · ${section.label}`,
      data: { points },
      created_at: session.startedAt,
    })));
    const annotationCandidates: Array<WhiteboardAsset | null> = [
      highlightedPart
        ? {
            id: `${lessonId}:${activeSection.id}:annotation:highlight`,
            kind: 'annotation' as const,
            section_id: activeSection.id,
            label: 'تحديد على السبورة',
            data: { text: highlightedPart },
            created_at: session.startedAt,
          }
        : null,
      session.note.trim()
        ? {
            id: `${lessonId}:${activeSection.id}:annotation:note`,
            kind: 'annotation' as const,
            section_id: activeSection.id,
            label: 'ملاحظة مرتبطة بالمسار',
            data: { text: session.note.trim() },
            created_at: session.startedAt,
          }
        : null,
    ];
    const annotations = annotationCandidates.filter((asset): asset is WhiteboardAsset => asset !== null);
    const copilotAssets = session.copilotInteractions.map((interaction) => ({
      id: interaction.id,
      kind: 'annotation' as const,
      section_id: interaction.sectionId,
      label: 'سؤال فهيم على جزء محدد',
      data: {
        text: `السؤال: ${interaction.question}\nالإجابة: ${interaction.answer}`,
        question: interaction.question,
        answer: interaction.answer,
        selection: interaction.selection,
      },
      created_at: interaction.createdAt,
    }));
    return [...strokes, ...annotations, ...copilotAssets];
  }, [activeSection.id, activeSection.label, highlightedPart, session.copilotInteractions, session.note, session.startedAt, session.whiteboardStrokesBySection]);

  const buildSessionSummary = (
    completedAt: string,
    masteredDaleelSummary = daleelResponse?.summary_data,
  ): LocalSummary => ({
    id: `summary-${lessonId}`,
    lessonId,
    lessonTitle: fixedLessonTitle,
    subject: fixedLessonSubject,
     summary: masteredDaleelSummary?.official_stamp_applied
       ? `${masteredDaleelSummary.title}: ${masteredDaleelSummary.key_takeaways.join(' · ')}`
       : `خلاصة جلسة فهيم مؤسسة على المصدر المسترجع: ثبّت ${totalCompleted} من ${totalExamples} أمثلة عملية، وراجعت الفكرة من ${formatSessionTime(session.startedAt)} حتى ${formatSessionTime(completedAt)}. ${sourceExcerpt || 'لم يُسترجع مقتطف مصدر لهذه الجلسة.'} ${session.note.trim() ? `ملاحظتك: ${session.note.trim()}` : 'يمكنك إضافة ملاحظة قصيرة من بطاقة ملاحظتك قبل الجلسة التالية.'}`,
    concepts: lessonSections.map((section) => {
      const mastered = session.gradedExamples[`${section.id}-grounded`] === 'correct' ? 1 : 0;
      return {
        id: section.id,
        title: generatedLesson?.elements.find((item) => item.kind === elementKindForSection(section.id))?.title ?? section.label,
        summary: sourceForSection(section, foundationalSources)?.summary || 'لا يوجد مقتطف مسترجع لهذا المفهوم بعد.',
        mastery: mastered * 100,
      };
    }),
    whiteboard_assets: whiteboardAssets,
    startedAt: session.startedAt,
    completedAt,
    progress,
    officialStamp: 'TAWJEEH.ED · OFFICIAL SEAL',
    officialStampApplied: masteredDaleelSummary?.official_stamp_applied === true,
    summaryTitle: masteredDaleelSummary?.title || 'ملخص متابعة الجلسة',
    keyTakeaways: masteredDaleelSummary?.key_takeaways ?? [],
    logo: 'tawjeeh-owl-transparent.png',
    groundingQuery: agentReadinessQuery.data?.retrieval.query ?? '',
    groundingNodeIds: agentReadinessQuery.data?.retrieval.retrievedNodeIds ?? [],
  });

  const syncSummary = (summary: LocalSummary, state: 'saving' | 'saved' | 'error' = 'saving') => {
    if (!summary.officialStampApplied || summary.progress < 100) {
      setSummaryPreview(summary);
      setSummarySaveState('error');
      return;
    }
    saveOfficialSummaryToProfile(summary);
    setSummaryPreview(summary);
    setSummarySaveState(state);
    completeLessonMutation.mutate({
      lessonId,
      data: {
        lesson_id: lessonId,
        lesson_title: summary.lessonTitle,
        subject: summary.subject,
        summary: summary.summary,
        mastery: summary.progress,
        whiteboard_assets: summary.whiteboard_assets,
        grounding_query: summary.groundingQuery,
        grounding_node_ids: summary.groundingNodeIds,
        concepts: summary.concepts.map(({ id, title, summary: conceptSummary, mastery }) => ({
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

  const previewLocalSummary = (summary: LocalSummary) => {
    setSummaryPreview(summary);
  };

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

  const applyFahimResponse = (payload: FahimPayload) => {
    const candidate = payload.fahim;
    if (
      !candidate
      || typeof candidate.speech_text !== 'string'
      || typeof candidate.chat_response !== 'string'
      || typeof candidate.evaluated_skill !== 'string'
      || typeof candidate.mastery_score !== 'number'
      || !Array.isArray(candidate.whiteboard_actions)
    ) {
      return payload.answer ?? '';
    }
    const response: FahimResponse = {
      speech_text: candidate.speech_text,
      chat_response: candidate.chat_response,
      evaluated_skill: candidate.evaluated_skill,
      mastery_score: Math.max(0, Math.min(100, Math.round(candidate.mastery_score))),
      whiteboard_actions: candidate.whiteboard_actions.filter((item): item is FahimWhiteboardAction => Boolean(
        item
        && typeof item === 'object'
        && (item.action === 'draw_diagram' || item.action === 'type_text' || item.action === 'highlight_area')
        && item.details
        && typeof item.details === 'object',
      )),
    };
    setFahimResponse(response);
    const highlight = response.whiteboard_actions.find((item) => item.action === 'highlight_area');
    const label = typeof highlight?.details.label === 'string' ? highlight.details.label : '';
    if (label) {
      setHighlightedPart(label);
      setBoardMode('highlight');
    }
    const coordinateValue = (key: string) => {
      const value = Number(highlight?.details[key]);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
    };
    const x = coordinateValue('x');
    const y = coordinateValue('y');
    const width = coordinateValue('width');
    const height = coordinateValue('height');
    if (x !== null && y !== null && width !== null && height !== null) {
      setFahimBoardTarget({ x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) });
    }
    setWhiteboardOwlState(response.whiteboard_actions.length ? 'speaking' : 'thinking');
    return response.chat_response;
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

  const concludeSession = (
    masteredDaleelSummary?: DaleelResponse['summary_data'],
    retry = false,
  ) => {
    if (retry && !session.concludedAt) return;
    if (!masteredDaleelSummary?.official_stamp_applied || progress < 100) {
      setSummaryPreview(buildSessionSummary(new Date().toISOString(), masteredDaleelSummary));
      setSummarySaveState('error');
      return;
    }
    if (!ragReady) {
      setSummarySaveState('error');
      return;
    }
    if (!retry && (!evaluationComplete || session.concludedAt)) return;
    const completedAt = new Date().toISOString();
    const localSummary = buildSessionSummary(completedAt, masteredDaleelSummary);
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
    syncSummary(localSummary);
  };

  useEffect(() => {
    if (progress !== 100 || !ragReady || session.concludedAt || summarySaveState !== 'idle' || masterySummaryRequestedRef.current) {
      return;
    }
    masterySummaryRequestedRef.current = true;
    void (async () => {
      try {
        const daleel = await requestDaleel(
          'أتممت خطوات الدرس. أنشئ الآن ملخصًا رسميًا مكثفًا يحمل ختم Tawjeeh.ed.',
          null,
          true,
        );
        if (!daleel.summary_data.official_stamp_applied) {
          throw new Error('لم يكتمل الختم الرسمي للملخص.');
        }
        concludeSession(daleel.summary_data);
      } catch {
        masterySummaryRequestedRef.current = false;
        setMessages((current) => [...current, {
          id: `daleel-summary-retry-${Date.now()}`,
          role: 'assistant',
          text: 'اكتمل إتقانك للدرس، لكن الملخص الرسمي يحتاج إلى إعادة المحاولة. سيبقى الدرس مفتوحًا حتى يُحفظ بالختم.',
        }]);
      }
    })();
  }, [progress, ragReady, session.concludedAt, summarySaveState]);

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
    if (!ragReady || session.concludedAt) return;
    const timeout = window.setTimeout(() => {
      // Keep the draft visible locally while the learner is working. The
      // profile bank is reserved for the official, mastery-gated summary.
      previewLocalSummary(buildSessionSummary(new Date().toISOString()));
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [
    activeSection.id,
    highlightedPart,
    progress,
    ragReady,
    session.concludedAt,
    session.flowNotes,
    session.note,
    session.whiteboardStrokesBySection,
    sourceExcerpt,
  ]);

  useEffect(() => {
    window.localStorage.setItem(attemptBankKey, JSON.stringify(attemptBank));
  }, [attemptBank]);

  useEffect(() => {
    if (!isPlaying) return;
    void owlVideoRef.current?.play().catch(() => undefined);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      emitOwlSyncEvent({ type: 'tts:start' });
       const utterance = new SpeechSynthesisUtterance(narrationText);
      utterance.lang = 'ar-SA';
      utterance.rate = .92;
      utterance.onboundary = (event) => {
         const length = narrationText.length || 1;
        const nextProgress = Math.min(100, Math.round((event.charIndex / length) * 100));
        setNarrationProgress(nextProgress);
        const maxStep = Math.max(...daleelCanvasCommands.map((command) => command.step), 1);
         const activeBoundaryIndex = narrationBoundaries.findIndex((boundary) => event.charIndex < boundary.end);
         const sentenceStep = activeBoundaryIndex >= 0
           ? activeBoundaryIndex + 1
           : Math.ceil((nextProgress / 100) * maxStep);
        emitOwlSyncEvent({
          type: 'board:step',
           step: Math.max(1, Math.min(maxStep, sentenceStep)),
        });
      };
      utterance.onend = () => {
        setNarrationProgress(100);
        emitOwlSyncEvent({ type: 'board:step', step: Math.max(...daleelCanvasCommands.map((command) => command.step), 1) });
        emitOwlSyncEvent({ type: 'tts:end' });
      };
      window.speechSynthesis.speak(utterance);
    }
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, [daleelCanvasCommands, isPlaying, narrationBoundaries, narrationText]);

  useEffect(() => () => {
    speechRecognitionRef.current?.stop();
    copilotSpeechRecognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    setNarrationProgress(0);
    setIsPlaying(false);
    setHighlightedPart('');
    setDaleelResponse(null);
    setDaleelCanvasCommands([]);
    setGeneratedLesson(null);
    setGeneratedExercise(null);
    setExerciseAttemptImage(null);
    setExerciseAttemptName('');
    setExerciseAttemptState('idle');
    setExerciseAttemptError('');
    setExerciseAttemptStartedAt(null);
    setExerciseAttemptElapsed(0);
    setPaperCopilotOpen(false);
    setPaperCopilotQuestion('');
    setPaperCopilotAnswer('');
    setPaperCopilotState('idle');
    setPaperCopilotError('');
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
    if (!isBoardImmersive && !isTopicImmersive) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (paperCopilotOpen || boardCopilotOpen) return;
      event.preventDefault();
      if (isTopicImmersive) {
        setIsTopicImmersive(false);
      } else {
        setIsBoardImmersive(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [boardCopilotOpen, isBoardImmersive, isTopicImmersive, paperCopilotOpen]);

  const selectSection = (section: LessonSection) => {
    if (section.id === activeSection.id) return;
    setRoadmapSync(null);
    setHighlightedPart('');
    setSession((current) => ({
      ...current,
      activeConcept: section.id,
      flowNotes: {
        ...current.flowNotes,
        [section.id]: `انتقلنا إلى «${section.label}». ${section.prompt}`,
      },
    }));
    setMessages((current) => [...current, { id: `section-${section.id}-${Date.now()}`, role: 'assistant', text: `انتقلنا إلى «${section.label}». ${section.prompt}` }]);
  };

  const syncBoardFromRoadmap = useCallback((sync: LessonBoardSync) => {
    const targetRegion = sync.stage === 'example'
      ? hotspots[1] ?? hotspots[0]
      : sync.stage === 'formula'
        ? hotspots[2] ?? hotspots[0]
        : hotspots[0];
    setRoadmapSync(sync);
    setBoardMode('highlight');
    setHighlightedPart(targetRegion?.label ?? '');
  }, [hotspots]);

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
      flowNotes: {
        ...current.flowNotes,
        [activeSection.id]: isCorrect
          ? `ثُبّتت خطوة «${example.title}» بإجابة صحيحة.`
          : `تحتاج خطوة «${example.title}» إلى مراجعة قبل التقدم.`,
      },
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
          lesson: fixedLessonTitle,
          level: '3AS',
          subject: fixedLessonSubject,
          curriculum_year: '3AS',
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
       const generated = {
         ...(payload as Omit<GeneratedLesson, 'concept'>),
         lessonTitle: fixedLessonTitle,
         concept: activeSection.id,
       };
       setGeneratedLesson(generated);
      setLessonGenerationState('ready');
      setHighlightedPart(typeof payload.highlight === 'string' ? payload.highlight : '');
       try {
         await requestDaleel(
           `ابدأ معي الآن بشرح «${activeSection.title}» خطوةً خطوة، ثم توقف عند سؤال قصير لأتأكد من الفهم.`,
           null,
           false,
           [
             `الهدف: ${generated.objective}`,
             `الشرح: ${generated.explanation}`,
             `الفكرة المميزة: ${generated.highlight}`,
             generated.elements.map((element) => `${element.title}: ${element.summary}`).join('\n'),
             sourceExcerpt,
           ].filter(Boolean).join('\n'),
         );
       } catch {
         setMessages((current) => [...current, {
           id: `daleel-start-warning-${Date.now()}`,
           role: 'assistant',
           text: 'تم تجهيز محتوى الدرس، لكن تشغيل دليل يحتاج إلى إعادة المحاولة من زر الشرح.',
         }]);
       }
       void generateExerciseForStudent(
         `${activeSection.title}. ابنِ تمرين التثبيت مباشرة من شرح الدرس المسترجع: ${typeof payload.explanation === 'string' ? payload.explanation : ''}`,
         true,
       );
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

  const askCopilotQuestion = async (text: string, topic = selectedCreativeTopic, focusText = '') => {
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
            focusText ? `الجزء الذي حدده الطالب من الموضوع: ${focusText}` : '',
            `عدد مكتسبات قاعدة المعرفة المتاحة: ${foundationalSources.length}`,
          ].filter(Boolean).join('\n'),
          topicContext,
        }),
      });
      const payload = await response.json() as FahimPayload;
      if (!response.ok || !payload.answer) throw new Error(payload.message || 'تعذر رد فهيم');
      const reply = applyFahimResponse(payload) || payload.answer;
      setMessages((current) => [...current, { id: `copilot-answer-${Date.now()}`, role: 'assistant', text: reply }]);
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

  const openCreativeTopic = (topic: CreativeIdea) => {
    setSelectedCreativeTopic(topic);
    setSelectedTopicExcerpt('');
    setTopicCompletionState('idle');
    setIsTopicImmersive(true);
  };

  const captureSelectedTopicText = () => {
    const selected = window.getSelection()?.toString().trim() ?? '';
    if (selected.length >= 8) {
      setSelectedTopicExcerpt(selected.slice(0, 420));
    }
  };

  const askAboutSelectedTopicExcerpt = () => {
    if (!selectedTopicExcerpt || !topicForStudio) return;
    void askCopilotQuestion(
      `حلل الجزء المحدد من الموضوع ثم اطرح سؤالين قصيرين عليه، من السهل إلى المركب، من دون كشف الحل.`,
      topicForStudio,
      selectedTopicExcerpt,
    );
  };

  const generateCreativeTopic = async (completedTopic?: CreativeIdea, independent = false): Promise<CreativeIdeasResponse | null> => {
    if (!ragReady || isThinking || chatCircuitOpen) return null;
    if (!independent) setActivePartner('exercises');
    setCreativeTopicError('');
    setIsThinking(true);
    if (completedTopic) setTopicCompletionState('analyzing');
    try {
       const response = await fetchWithTimeout('/api/lesson/exercise', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lesson: fixedLessonTitle,
          level: '3AS',
            subject: fixedLessonSubject,
            curriculum_year: '3AS',
           activeConcept: independent ? 'تطبيق مستقل' : activeSection.title,
           mode: 'creative_topic',
           attemptContext: [
             independent
               ? 'ولّد موضوعات تطبيقية مستقلة يمكن للطالب البدء بها بعد الحصة النظرية أو دون ربطها بقسم نظري محدد. اجعل كل موضوع مختصرًا وواضحًا وقابلًا للتنفيذ.'
               : 'حوّل الموضوع إلى تطبيقات إبداعية قابلة للدراسة الآن، لا إلى أفكار عامة فقط.',
             completedTopic ? `الموضوع المنجز الذي يجب تحليله قبل الانتقال: ${completedTopic.title}. حلل معطياته، نقطة بدايته، المطلوب، والعائق الإبداعي قبل اقتراح الموضوع التالي.` : '',
             completedTopic ? `تفاصيل الموضوع المنجز: ${completedTopic.approach} | ${completedTopic.steps.join(' | ')} | ${completedTopic.creativeTwist} | ${completedTopic.expectedOutcome}` : '',
             !independent && generatedLesson?.objective ? `هدف الدرس: ${generatedLesson.objective}` : '',
             !independent ? sourceExcerpt : '',
           ].filter(Boolean).join('\n'),
        }),
      });
      const payload = await response.json() as Partial<CreativeIdeasResponse> & { message?: string };
      if (!response.ok || payload.status !== 'generated' || !payload.solutionSummary || !Array.isArray(payload.ideas) || payload.ideas.length < 3 || payload.grounding?.status !== 'ready') {
        throw new Error(payload.message || 'تعذر توليد المسارات الإبداعية');
      }
       const generated = payload as CreativeIdeasResponse;
       setCreativeIdeas(generated);
       setCreativeTopicError('');
        setTopicAnalysis(
          generated.fallbackMessage
            ? `${generated.fallbackMessage}\n\n${generated.solutionSummary}`
            : generated.solutionSummary,
        );
       if (completedTopic) {
         const nextTopic = generated.ideas.find((idea) => idea.title !== completedTopic.title) ?? generated.ideas[0];
         setSelectedCreativeTopic(nextTopic);
         setSelectedTopicExcerpt('');
         setIsTopicImmersive(true);
         setTopicCompletionState('advanced');
       } else if (!selectedCreativeTopic) {
         setSelectedCreativeTopic(generated.ideas[0]);
       }
        if (!independent) {
         setMessages((current) => [...current, {
           id: `topic-creative-${Date.now()}`,
           role: 'assistant',
                 text: generated.fallbackMessage
              ? generated.fallbackMessage
              : completedTopic
                ? `حللت معطيات «${completedTopic.title}» وفتحت لك الموضوع التالي مباشرة: «${(generated.ideas.find((idea) => idea.title !== completedTopic.title) ?? generated.ideas[0]).title}».`
                 : `جهزت لك ${generated.ideas.length} موضوعات تطبيقية مختلفة. افتح أي موضوع لبدء دراسته.`,
         }]);
       }
       return generated;
      } catch (error) {
       if (completedTopic) setTopicCompletionState('error');
        const errorText = error instanceof Error ? error.message : String(error);
        const readableError = /402|insufficient balance/i.test(errorText)
          ? 'توليد الموضوع متوقف مؤقتًا لأن رصيد خدمة الذكاء الاصطناعي غير كافٍ.'
          : 'تعذر توليد الموضوع الآن. أعد المحاولة بعد قليل.';
        if (independent) {
          setCreativeTopicError(readableError);
        } else {
          setMessages((current) => [...current, {
            id: `topic-generation-error-${Date.now()}`,
            role: 'assistant',
            text: readableError,
          }]);
        }
        setChatCircuitOpen(false);
       return null;
    } finally {
      setIsThinking(false);
    }
  };

  const completeCreativeTopic = async () => {
    if (!topicForStudio || isThinking || chatCircuitOpen) return;
    await generateCreativeTopic(topicForStudio);
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
      const payload = await response.json() as FahimPayload;
      if (!response.ok || !payload.answer) throw new Error(payload.message || 'تعذر رد فهيم');
      const reply = applyFahimResponse(payload) || payload.answer;
      setMessages((current) => [...current, { id: `answer-${Date.now()}`, role: 'assistant', text: reply }]);
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

  const requestDaleel = async (
    questionText: string,
    selection: WhiteboardSelection | null = boardSelection,
    mastery = progress >= 100,
    contentOverride?: string,
  ): Promise<DaleelResponse> => {
    const teachingContent = [
      `الشرح الحالي: ${displayedExplanation}`,
      `الفكرة المميزة: ${displayedHighlight}`,
      generatedLesson?.elements.map((element) => `${element.title}: ${element.summary}`).join('\n') ?? '',
      sourceExcerpt,
    ].filter(Boolean).join('\n');
    const response = await fetchWithTimeout('/api/ai/daleel', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lesson_title: fixedLessonTitle,
        level: '3AS',
        subject: fixedLessonSubject,
        curriculum_year: '3AS',
        question: questionText,
         content: contentOverride || teachingContent,
        mastery,
        ...(selection
          ? {
              highlighted_region: {
                x: selection.x,
                y: selection.y,
                width: selection.width,
                height: selection.height,
              },
            }
          : {}),
      }),
    });
    const payload = await response.json() as Partial<DaleelResponse> & { message?: string };
    if (
      !response.ok
      || typeof payload.speech_text !== 'string'
      || !Array.isArray(payload.canvas_commands)
      || !payload.summary_data
    ) {
      throw new Error(payload.message || 'تعذر تشغيل دليل الآن.');
    }
    const daleel = payload as DaleelResponse;
    setDaleelResponse(daleel);
    setDaleelCanvasCommands(daleel.canvas_commands);
    setWhiteboardOwlState('speaking');
    setBoardCopilotAnswer(daleel.speech_text);
    setBoardCopilotState('answered');
    setBoardCopilotError('');
    if (selection) {
      setFahimBoardTarget({
        x: selection.x,
        y: selection.y,
        width: selection.width,
        height: selection.height,
      });
    } else {
      const focusCommand = daleel.canvas_commands.find((command) => command.type === 'highlight')
        ?? daleel.canvas_commands.find((command) => command.type === 'write');
      if (focusCommand) {
        setFahimBoardTarget({
          x: focusCommand.coordinates.x,
          y: focusCommand.coordinates.y,
          width: Math.min(.28, 1 - focusCommand.coordinates.x),
          height: Math.min(.16, 1 - focusCommand.coordinates.y),
        });
      }
    }
    setBoardCopilotOpen(Boolean(selection));
    setIsPlaying(true);
    return daleel;
  };

  const requestOfficialSummary = async () => {
    if (progress < 100 || !ragReady || session.concludedAt) return;
    setSummarySaveState('saving');
    try {
      const daleel = await requestDaleel(
        'أتممت خطوات الدرس. أنشئ الآن ملخصًا رسميًا مكثفًا يحمل ختم Tawjeeh.ed.',
        null,
        true,
      );
      if (!daleel.summary_data.official_stamp_applied) {
        throw new Error('لم يكتمل الختم الرسمي للملخص.');
      }
      concludeSession(daleel.summary_data);
    } catch {
      setSummarySaveState('error');
      setMessages((current) => [...current, {
        id: `daleel-summary-retry-${Date.now()}`,
        role: 'assistant',
        text: 'اكتمل إتقانك للدرس، لكن الملخص الرسمي يحتاج إلى إعادة المحاولة. سيبقى الدرس مفتوحًا حتى يُحفظ بالختم.',
      }]);
    }
  };

  const askPartner = async (text: string, selection: WhiteboardSelection | null = boardSelection) => {
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
      if (activePartner === 'dalil') {
        const daleelQuestion = selection
          ? `اشرح لي مباشرة ما يظهر في المنطقة المحددة من السبورة. ${cleanText}`
          : cleanText;
        const daleel = await requestDaleel(daleelQuestion, selection);
        setMessages((current) => [...current, {
          id: `daleel-answer-${Date.now()}`,
          role: 'assistant',
          text: daleel.speech_text,
        }]);
        if (daleel.summary_data.official_stamp_applied && progress >= 100 && !session.concludedAt) concludeSession(daleel.summary_data);
        return;
      }
       const response = await queryKnowledgeMutation.mutateAsync({
        data: {
          query: cleanText,
           n_results: intensiveExamMode ? 1 : 3,
          subject: 'العلوم الفيزيائية',
        },
      });
      const source = response.results?.[0];
      const targetedConcept = examMode?.error_concepts[0]?.concept_title;
       const sourceContext = source
         ? `مرجع من «${source.title}» (${source.source} · ص ${source.page}): ${source.summary.slice(0, 360)}`
        : `مرجع الدرس الحالي: ${sourceExcerpt}`;
      let reply = 'سأثبت الفكرة أولًا، ثم أبني لك تطبيقًا مناسبًا لها.';
      if (activePartner === 'exercises') {
        const wantsCreativeTopics = /موضوع|إبداع|فكرة|مسار|تطبيقات مختلفة|زاوية/.test(cleanText);
        const response = await fetchWithTimeout('/api/lesson/exercise', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            lesson: 'قوانين نيوتن والحركة',
            level: '3AS',
            subject: fixedLessonSubject,
            curriculum_year: '3AS',
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
           reply = `بدأت بالحل، ثم جهزت لك ${(payload as CreativeIdeasResponse).ideas.length} موضوعات مختلفة. اختر واحدًا وابدأ من خطواته.`;
        } else {
          const payload = await response.json() as Partial<GeneratedExercise> & { message?: string };
        if (!response.ok || payload.status !== 'generated' || !payload.prompt) {
            throw new Error(payload.message || 'تعذر توليد تمرين مؤسس على المعرفة');
          }
          setGeneratedExercise(payload as GeneratedExercise);
          setExerciseAttemptImage(null);
          setExerciseAttemptName('');
          setExerciseAttemptState('idle');
          setExerciseAttemptError('');
          setAnalysis(null);
          setExerciseAttemptStartedAt(Date.now());
          setExerciseAttemptElapsed(0);
           reply = (payload as GeneratedExercise).fallback
             ? `جهزت لك ورقة تدريب بعنوان «${(payload as GeneratedExercise).title}». ابدأ بكتابة المعطيات والخطوة الأولى.`
             : `جهزت لك تدريبًا على «${(payload as GeneratedExercise).title}». ابدأ بكتابة المعطيات والخطوة الأولى.`;
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

  const analyzeAttempt = async (
    imageDataUrl: string,
    fileName: string,
    exerciseContext = '',
    exerciseLesson = 'قوانين نيوتن والحركة',
    elapsedSeconds = 0,
  ): Promise<boolean> => {
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
           lesson: exerciseLesson,
           concept: exerciseContext ? `${activeSection.title} — ${exerciseContext.slice(0, 1200)}` : activeSection.title,
           elapsed_seconds: elapsedSeconds,
         }),
      });
      const payload = await response.json() as Partial<AttemptAnalysis> & FahimPayload;
      if (
        !response.ok
        || !payload.firstError
        || !payload.lastCorrectStep
        || !payload.errorArea
        || typeof payload.errorArea.label !== 'string'
      ) throw new Error(payload.message || 'تعذر تحليل المحاولة');
      const nextAnalysis = payload as AttemptAnalysis;
      setAnalysis(nextAnalysis);
      setAnalysisState('ready');
      applyFahimResponse(payload);
      setFahimBoardTarget({
        x: Math.max(0, Math.min(1, payload.errorArea.x)),
        y: Math.max(0, Math.min(1, payload.errorArea.y)),
        width: Math.max(0, Math.min(1, payload.errorArea.width)),
        height: Math.max(0, Math.min(1, payload.errorArea.height)),
      });
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
      return true;
    } catch (error) {
      setAnalysisState('error');
      setAnalysisError(error instanceof Error ? error.message : 'تعذر تحليل الصورة');
      return false;
    }
  };

  const handleGeneratedExerciseAttempt = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setExerciseAttemptError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setExerciseAttemptState('error');
      setExerciseAttemptError('ارفع صورة واضحة لورقة الحل.');
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      setExerciseAttemptState('error');
      setExerciseAttemptError('حجم الصورة يجب أن يكون أقل من 7 ميغابايت.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !generatedExercise) return;
      const imageDataUrl = reader.result;
      setExerciseAttemptImage(imageDataUrl);
      setExerciseAttemptName(file.name);
      setExerciseAttemptState('analyzing');
      const elapsedAtUpload = exerciseAttemptStartedAt
        ? Math.max(0, Math.floor((Date.now() - exerciseAttemptStartedAt) / 1000))
        : exerciseAttemptElapsed;
      void analyzeAttempt(
        imageDataUrl,
        file.name,
        generatedExercise.prompt,
        generatedExercise.lessonTitle,
        elapsedAtUpload,
      ).then((analyzed) => {
        setExerciseAttemptState(analyzed ? 'ready' : 'error');
        if (analyzed) {
          setPaperCopilotAnswer('قرأت ورقتك وربطتها بهذا التمرين. اسألني عن موضع المراجعة أو الخطوة التالية.');
          setPaperCopilotState('idle');
          setPaperCopilotError('');
          setPaperCopilotOpen(false);
        } else {
          setExerciseAttemptError('تعذر قراءة المحاولة. أعد رفع صورة أوضح.');
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const askPaperAttemptCopilot = async () => {
    if (!generatedExercise || !analysis || !paperCopilotQuestion.trim() || paperCopilotState === 'asking') return;
    const questionText = paperCopilotQuestion.trim();
    setPaperCopilotState('asking');
    setPaperCopilotError('');
    try {
      const response = await fetchWithTimeout('/api/fahim/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          lesson: generatedExercise.lessonTitle,
          concept: generatedExercise.title,
          context: [
            'هذا السؤال مرتبط بصورة محاولة ورقية حللها فهيم.',
            `نص المطلوب: ${generatedExercise.prompt}`,
            `المطلوبات: ${generatedExercise.sections?.map((item) => `${item.title}: ${item.prompt}`).join(' | ') ?? ''}`,
            `آخر خطوة صحيحة: ${analysis.lastCorrectStep}`,
            `أول موضع يحتاج مراجعة: ${analysis.firstErrorStep}`,
            `التغذية الراجعة: ${analysis.feedback}`,
            `زمن المحاولة حتى الرفع: ${formatElapsed(exerciseAttemptElapsed)}`,
            'اشرح الخطوة التالية أو سبب الخطأ بتوجيه تدريجي. لا تعرض الحل النموذجي الكامل، ولا تذكر مصادر أو مراجع التصحيح.',
          ].join('\n'),
          elapsed_seconds: exerciseAttemptElapsed,
        }),
      });
      const payload = await response.json() as { answer?: string; chat_response?: string; message?: string };
      const answer = payload.answer || payload.chat_response;
      if (!response.ok || !answer) throw new Error(payload.message || 'تعذر رد فهيم على المحاولة.');
      setPaperCopilotAnswer(answer);
      setPaperCopilotQuestion('');
      setPaperCopilotState('idle');
    } catch (error) {
      setPaperCopilotState('error');
      setPaperCopilotError(error instanceof Error ? error.message : 'تعذر رد فهيم الآن.');
    }
  };

  const downloadGeneratedExercise = () => {
    if (!generatedExercise) return;
    const sections = generatedExercise.sections?.map((section, index) => (
      `${index + 1}. ${section.prompt}`
    )).join('\n\n') || generatedExercise.prompt;
    const content = [
      generatedExercise.title,
      `المادة: ${generatedExercise.lessonTitle}`,
      `العلامة: ${generatedExercise.totalPoints ?? 20} نقطة`,
      '',
      'تعليمات: أجب على الورقة بخطك ثم صوّر المحاولة وارفعها للتحليل.',
      '',
      sections,
    ].join('\n');
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${generatedExercise.title.replace(/[^\p{L}\p{N}\s-]/gu, '').trim() || 'ورقة-تمرين'}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
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
       setAttachmentError('حجم الصورة يجب أن يكون أقل من 5 ميغابايت.');
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
    setFahimBoardTarget(null);
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

  const generateExerciseForStudent = async (attemptContext: string, silent = false) => {
    if (chatCircuitOpen) return;
    if (!ragReady) {
      setMessages((current) => [...current, {
        id: `exercise-not-ready-${Date.now()}`,
        role: 'assistant',
        text: 'لم يكتمل إعداد محتوى التمرين بعد. أعد المحاولة بعد لحظات.',
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
          lesson: fixedLessonTitle,
          level: '3AS',
          subject: fixedLessonSubject,
          curriculum_year: '3AS',
          activeConcept: activeSection.title,
            attemptContext,
        }),
      });
       const payload = await response.json() as Partial<GeneratedExercise> & { message?: string };
       if (!response.ok || payload.status !== 'generated' || !payload.prompt) {
        throw new Error(payload.message || 'تعذر توليد تمرين مؤسس على المعرفة');
      }
      setGeneratedExercise(payload as GeneratedExercise);
      setExerciseAttemptImage(null);
      setExerciseAttemptName('');
      setExerciseAttemptState('idle');
      setExerciseAttemptError('');
      setAnalysis(null);
      setExerciseAttemptStartedAt(Date.now());
      setExerciseAttemptElapsed(0);
      setMessages((current) => [...current, {
        id: `exercise-${Date.now()}`,
        role: 'assistant',
           text: (payload as GeneratedExercise).fallback
             ? 'جهزت لك ورقة تدريب. ابدأ بكتابة المعطيات والخطوة الأولى.'
           : analysis
             ? 'بنيت لك تمرينًا يعالج موضع الخطأ من الدرس وسجل محاولاتك. ابدأ بكتابة المعطيات والخطوة الأولى.'
             : 'جهزت لك تمرينًا مناسبًا للمفهوم الحالي. حاول وحدك أولًا، ثم اطلب التلميح عند الحاجة.',
      }]);
    } catch {
      if (silent) {
        setMessages((current) => [...current, {
          id: `exercise-generation-warning-${Date.now()}`,
          role: 'assistant',
          text: 'تم تجهيز الشرح، لكن تمرين التثبيت يحتاج إلى إعادة المحاولة. لن نعرض تمرينًا غير موثق.',
        }]);
      } else {
        openChatCircuit();
      }
    } finally {
      setIsThinking(false);
    }
  };

  const buildExercise = async () => {
    if (!analysis) return;
    await generateExerciseForStudent(`${analysis.lastCorrectStep} — ${analysis.firstError}: ${analysis.feedback}`);
  };

  const selectBoardRegion = (region: typeof hotspots[number]) => {
    pauseNarration();
    setBoardSelection(null);
    setHighlightedPart(region.label);
    setSession((current) => ({
      ...current,
      flowNotes: {
        ...current.flowNotes,
        [activeSection.id]: `حُدّد «${region.label}» على السبورة، وأصبح جاهزًا للشرح.`,
      },
    }));
    setMessages((current) => [...current, {
      id: `highlight-${Date.now()}`,
      role: 'assistant',
      text: `حددت «${region.label}». اسألني عنه وسأشرح الجزء نفسه خطوة خطوة.`,
    }]);
  };

  const commitBoardStroke = (completedStroke: Point[]) => {
    setSession((current) => {
      const strokes = [...(current.whiteboardStrokesBySection[activeSection.id] ?? []), completedStroke];
      return {
        ...current,
        whiteboardStrokes: strokes,
        whiteboardStrokesBySection: { ...current.whiteboardStrokesBySection, [activeSection.id]: strokes },
        flowNotes: {
          ...current.flowNotes,
          [activeSection.id]: `أضيف رسم إلى السبورة في خطوة «${activeSection.label}».`,
        },
      };
    });
  };

  const clearBoard = () => setSession((current) => ({
    ...current,
    whiteboardStrokes: [],
    whiteboardStrokesBySection: { ...current.whiteboardStrokesBySection, [activeSection.id]: [] },
    flowNotes: {
      ...current.flowNotes,
      [activeSection.id]: `مُسحت رسومات السبورة في خطوة «${activeSection.label}».`,
    },
  }));

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
        explanation: narrationText,
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

  const toggleBoardCopilotVoice = () => {
    if (isBoardCopilotListening) {
      copilotSpeechRecognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setBoardCopilotError('الإملاء الصوتي غير متاح في هذا المتصفح. اكتب سؤالك بدلًا من ذلك.');
      setBoardCopilotState('error');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) setBoardCopilotQuestion((current) => `${current} ${transcript}`.trim());
    };
    recognition.onerror = () => {
      setBoardCopilotError('لم نلتقط الصوت بوضوح. حاول مرة أخرى أو اكتب سؤالك.');
      setBoardCopilotState('error');
      setIsBoardCopilotListening(false);
      copilotSpeechRecognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsBoardCopilotListening(false);
      copilotSpeechRecognitionRef.current = null;
    };
    copilotSpeechRecognitionRef.current = recognition;
    setIsBoardCopilotListening(true);
    recognition.start();
  };

  const askBoardCopilot = async () => {
    if (!boardCopilotQuestion.trim() || boardCopilotState === 'asking') return;
    const questionText = boardCopilotQuestion.trim();
    setBoardCopilotState('asking');
    setBoardCopilotError('');
    if (!boardSelection) {
      setBoardCopilotOpen(false);
      await askCopilotQuestion(
        questionText,
        selectedCreativeTopic,
        highlightedPart ? `العنصر المحدد من السبورة: ${highlightedPart}` : `الموضوع الحالي: ${activeSection.title}`,
      );
      setBoardCopilotAnswer('أرسلت سؤالك إلى فهيم. ستظهر الإجابة في المحادثة.');
      setBoardCopilotState('answered');
      return;
    }
    try {
      const response = await fetchWithTimeout('/api/fahim/whiteboard-query', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: boardSelection.imageDataUrl,
          question: questionText,
          lesson: fixedLessonTitle,
          concept: activeSection.title,
          context: sourceExcerpt,
        }),
      });
      const payload = await response.json() as { answer?: string; message?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.message || 'تعذر رد فهيم على الجزء المحدد.');
      const interaction = {
        id: `${lessonId}:${activeSection.id}:copilot:${Date.now()}`,
        sectionId: activeSection.id,
        question: questionText,
        answer: payload.answer,
        selection: {
          x: boardSelection.x,
          y: boardSelection.y,
          width: boardSelection.width,
          height: boardSelection.height,
          shape: boardSelection.shape,
        },
        createdAt: new Date().toISOString(),
      } satisfies CopilotInteraction;
      setSession((current) => ({
        ...current,
        copilotInteractions: [...current.copilotInteractions.filter((item) => item.id !== interaction.id), interaction].slice(-12),
        flowNotes: {
          ...current.flowNotes,
          [activeSection.id]: 'حُفظ سؤال فهيم وإجابته مع الجزء المحدد من السبورة.',
        },
      }));
      setBoardCopilotAnswer(payload.answer);
      setBoardCopilotState('answered');
      setMessages((current) => [...current, { id: interaction.id, role: 'assistant', text: payload.answer as string }]);
    } catch (error) {
      setBoardCopilotError(error instanceof Error ? error.message : 'تعذر الاتصال بفهم السبورة.');
      setBoardCopilotState('error');
    }
  };

  return (
    <section className="lesson-workspace" dir="rtl" data-testid="lesson-workspace">
      <header className="lesson-workspace-header">
        <div className="lesson-title-block">
                 <span className="lesson-kicker"><Sparkles size={13} /> جلسة تثبيت · {fixedLessonSubject}</span>
          <h1>{displayedTitle}</h1>
          <p>اليوم {Math.min(evaluationDay, 10)} من رحلتك · فكرة واحدة، محاولة قصيرة، ثم علامة واضحة على ما فهمته.</p>
        </div>
        <div className="lesson-header-controls">
          <button
            type="button"
            className="lesson-back-button"
            onClick={() => setLocation('/program')}
            data-testid="button-back-to-program"
          >
            <ArrowLeft size={14} /> العودة إلى المسار
          </button>
          <div className="lesson-header-status" role="status" data-testid="status-lesson-progress">
            <span className="lesson-status-dot" aria-hidden="true" />
            <span>
              {session.concludedAt
                ? 'فهيم أنهى التقييم · التسليم جاهز'
                 : `${evaluationPlan.title} · اليوم ${evaluationPlan.mode === 'fixed-foundation' ? `${Math.min(evaluationDay, 10)} / 10` : evaluationDay}`}
            </span>
            <strong>{progress}٪</strong>
          </div>
          {!session.concludedAt && (
            <div className="lesson-conclude-wrap">
                <button type="button" className="lesson-conclude-button" onClick={() => void requestOfficialSummary()} disabled={!evaluationComplete || !ragReady || summarySaveState === 'saving'} data-testid="button-conclude-lesson">
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
            <strong>{phase4Active ? 'ثبت فهمك ثم طبّق' : 'شرح موثوق يتكيف معك'}</strong>
            <p>{phase4Active ? 'تابع الشرح مع دليل ثم انتقل إلى تمرين قصير يثبت ما تعلمته.' : 'يبدأ الدرس بشرح متدرّج، ثم يحوّل الفكرة إلى تطبيق يناسب إجابتك.'}</p>
        </div>
         <div className="lesson-evaluation-meta">
            <span>{phase4Active ? 'المرحلة التالية' : 'مسار الدرس'}</span>
            <strong>{phase4Active ? 'شرح + تمرين' : 'فهم + تطبيق'}</strong>
             <small>{phase4Active ? `اكتمل ${formatSessionTime(session.concludedAt ?? session.startedAt)}` : 'خطوات مترابطة'}</small>
        </div>
      </div>

      {fahimResponse && faheemActive && (
        <section className="lesson-fahim-diagnostic" aria-label="آخر تقييم من فهيم" data-testid="card-fahim-diagnostic">
          <div className="lesson-fahim-diagnostic-main">
            <span className="lesson-panel-kicker"><BrainCircuit size={13} /> قراءة فهيم الحالية</span>
            <strong>{fahimResponse.evaluated_skill}</strong>
            <p><MathText>{fahimResponse.chat_response}</MathText></p>
          </div>
          <div className="lesson-fahim-score" aria-label={`درجة الإتقان ${fahimResponse.mastery_score} من 100`}>
            <span>الإتقان</span>
            <strong>{fahimResponse.mastery_score}<small>٪</small></strong>
          </div>
          {fahimResponse.whiteboard_actions.length > 0 && (
            <div className="lesson-fahim-actions" aria-label="أفعال فهيم على السبورة">
              {fahimResponse.whiteboard_actions.map((item, index) => (
                <span key={`${item.action}-${index}`}>
                  {item.action === 'highlight_area' ? 'تحديد موضع' : item.action === 'draw_diagram' ? 'رسم توضيحي' : 'كتابة على اللوح'}
                  {typeof item.details.label === 'string' ? ` · ${item.details.label}` : ''}
                  {typeof item.details.text === 'string' ? ` · ${item.details.text}` : ''}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

       {examMode && examMode.mode !== 'standard' && (
         <div className={`lesson-exam-mode-strip ${examMode.mode === 'error_stack' ? 'is-error-stack' : ''}`} role="status" data-testid="card-lesson-exam-mode">
           <div><span className="lesson-panel-kicker"><Sparkles size={13} /> {examMode.label}</span><strong>{examMode.mode === 'error_stack' ? 'التمرين التالي يستهدف موضع الخطأ الأعلى.' : 'كثافة أعلى قبل موعد البكالوريا.'}</strong><p>{examMode.description}</p></div>
           <div className="lesson-exam-mode-meta"><strong>×{examMode.exercise_density}</strong><span>كثافة التمارين</span><small>{Math.max(0, examMode.days_until)} يومًا متبقيًا</small></div>
         </div>
       )}

       <div className={`lesson-grid ${isLessonRailCollapsed ? 'has-collapsed-rail' : ''}`}>
           <aside className={`lesson-panel lesson-path-panel ${isLessonRailCollapsed ? 'is-collapsed' : ''}`} aria-label="الطبقة الأولى: مسار إتقان الطالب" data-layer="mastery-path">
          <div className="lesson-panel-heading">
            <div>
                <span className="lesson-panel-kicker"><BookOpen size={13} /> طبقة 1 · مسار الطالب</span>
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
                   <span className="lesson-path-node">{done ? <Check size={15} /> : `${index + 1}`}</span>
                   <span className="lesson-path-copy"><strong>{section.label}</strong><small>{active ? displayedTitle : section.shortLabel}</small></span>
                  {active && <span className="lesson-path-current" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
           <div className="lesson-path-note"><Lightbulb size={15} /><span>اتبع الخطوات بالترتيب، وتنتقل السبورة معك تلقائيًا.</span></div>
        </aside>

          <section className="lesson-panel lesson-conversation-panel" aria-label={handoffComplete ? 'الطبقة الثانية: التواصل مع شركاء التعلّم' : 'الطبقة الثانية: حديثك مع فهيم'} data-layer="ai-conversation">
            <div className="lesson-layer-badge"><MessageCircle size={13} /> طبقة 2 · الحوار المباشر</div>
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
                 <p><MathText>{message.text}</MathText></p>
                 {message.id === 'chat-api-fallback' && <button type="button" className="lesson-generation-error-button" onClick={() => window.location.reload()} data-testid="button-refresh-lesson-chat"><RotateCcw size={12} /> تحديث الصفحة</button>}
              </article>
            ))}
             {activePartner === 'exercises' && creativeIdeas && (
               <article className="lesson-creative-card" data-testid="card-creative-ideas">
                 <div className="lesson-creative-card-head">
                   <div><span><Sparkles size={12} /> وكيل التمارين · موضوعات إبداعية · الحل أولًا</span><strong>{creativeIdeas.lessonTitle}</strong></div>
                   <small>{creativeIdeas.ideas.length} أفكار</small>
                 </div>
                  <p className="lesson-creative-solution"><MathText>{creativeIdeas.solutionSummary}</MathText></p>
                 <div className="lesson-creative-ideas">
                  {creativeIdeas.ideas.map((idea, index) => (
                    <div className={`lesson-creative-idea ${selectedCreativeTopic?.title === idea.title ? 'is-selected' : ''}`} key={`${idea.title}-${index}`}>
                        <div className="lesson-creative-idea-title"><span>{index + 1}</span><strong><MathText>{idea.title}</MathText></strong></div>
                        <p><MathText>{idea.approach}</MathText></p>
                        <ol>{idea.steps.map((step, stepIndex) => <li key={`${idea.title}-step-${stepIndex}`}><MathText>{step}</MathText></li>)}</ol>
                        <div className="lesson-creative-twist"><Lightbulb size={12} /><span><strong>اللمسة الإبداعية:</strong> <MathText>{idea.creativeTwist}</MathText></span></div>
                        <small className="lesson-creative-outcome">ما ستتعلمه: <MathText>{idea.expectedOutcome}</MathText></small>
                       <button type="button" className="lesson-creative-ask" onClick={() => openCreativeTopic(idea)} disabled={isThinking} data-testid={`button-ask-creative-topic-${index + 1}`}>
                         <Maximize2 size={12} /> افتح الموضوع والكوبيلوت
                      </button>
                     </div>
                   ))}
                 </div>
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
                 <p><MathText>{analysis.feedback}</MathText></p>
                <small className="lesson-analysis-coordinate"><ScanSearch size={12} /> حدّد فهيم موضع «{analysis.errorArea.label}» على الصورة بدقة.</small>
                <div className="lesson-analysis-actions"><button type="button" onClick={resetToLastCorrect} data-testid="button-reset-to-last-correct"><RotateCcw size={13} /> العودة لآخر خطوة</button><button type="button" onClick={buildExercise} data-testid="button-generate-error-exercise">ابنِ تمرينًا مشابهًا</button></div>
              </div>
            )}
          </form>
        </section>

           <section
              className={`lesson-panel lesson-teaching-panel ${isBoardImmersive ? 'is-immersive' : ''}`}
              aria-label={handoffComplete ? 'الطبقة الثالثة: مساحة الدرس والتمرين والحل' : 'الطبقة الثالثة: السبورة الذكية لفهيم'}
              data-layer="live-board"
             aria-modal={isBoardImmersive ? 'true' : undefined}
             aria-labelledby={isBoardImmersive ? 'lesson-board-immersive-title' : undefined}
             role={isBoardImmersive ? 'dialog' : undefined}
           >
          <div className="lesson-teaching-header">
             <div>
                 <span className="lesson-panel-kicker"><Volume2 size={13} /> طبقة 3 · {handoffComplete ? 'السبورة والمواضيع' : 'السبورة الحية'}</span>
               <h2 id={isBoardImmersive ? 'lesson-board-immersive-title' : undefined} data-testid="text-current-lesson-title">{displayedTitle}</h2>
                 <p>إيقاع مقترح · {activeSection.duration} · {activeSection.label}</p>
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
            <InteractiveLearningLoop
              lessonTitle={fixedLessonTitle}
              subject={fixedLessonSubject}
              section={{
                id: activeSection.id,
                label: activeSection.label,
                title: activeSection.title,
                explanation: activeSection.explanation,
                highlight: activeSection.highlight,
              }}
              resources={knowledgeCards.length ? knowledgeCards : foundationalSources}
              groundedLesson={generatedLesson}
              groundedExercise={generatedExercise}
               onBoardSync={syncBoardFromRoadmap}
              fallbackResource={activeSource ? {
                id: `active-source-${activeSection.id}`,
                title: activeSource.title,
                summary: activeSource.summary,
                subject: fixedLessonSubject,
                unit: '',
                lesson: activeSource.lesson,
                type: activeSource.type,
                difficulty: 'mixed',
                source: activeSource.source,
                page: activeSource.page,
                tags: activeSource.tags,
              } : null}
            />
           {lessonGenerationState === 'error' && (
             <div className="lesson-generation-error" role="alert" data-testid="status-lesson-generation-error">
               <span><MathText>{lessonGenerationError}</MathText></span>
               <button type="button" onClick={() => void generateLesson()} data-testid="button-retry-lesson-generation">إعادة المحاولة</button>
             </div>
           )}
          <div className="lesson-whiteboard-wrap">
            <div className="lesson-whiteboard-toolbar">
                  <span className="lesson-toolbar-copy"><BarChart3 size={14} /><span><strong>السبورة الرئيسية</strong><small>حدّد أي فكرة غير واضحة ليساعدك فهيم</small></span></span>
              <div>
                <button type="button" className={boardMode === 'pen' ? 'is-selected' : ''} onClick={() => setBoardMode('pen')} disabled={!lessonToolsActive} aria-label="أداة الكتابة" data-testid="button-whiteboard-pen"><PenLine size={14} /><span>اكتب</span></button>
                  <button type="button" className={boardMode === 'highlight' ? 'is-selected' : ''} onClick={() => setBoardMode('highlight')} disabled={!lessonToolsActive} aria-label="أداة التظليل والنقر" data-testid="button-whiteboard-highlight"><Highlighter size={14} /><span>ظلّل</span></button>
                  <button type="button" className={boardMode === 'select' ? 'is-selected' : ''} onClick={() => setBoardMode('select')} disabled={!lessonToolsActive} aria-label="أداة تحديد جزء وسؤال فهيم" data-testid="button-whiteboard-select"><ScanSearch size={14} /><span>اسأل</span></button>
                  <button type="button" onClick={clearBoard} disabled={!lessonToolsActive} aria-label="مسح الكتابة" data-testid="button-whiteboard-clear"><Eraser size={14} /><span>امسح</span></button>
              </div>
            </div>
             <div className="lesson-canvas-shell">
                {roadmapSync && roadmapSync.sectionId === activeSection.id && (
                  <div className={`lesson-board-sync-focus is-${roadmapSync.stage}`} role="status" aria-live="polite" data-testid="status-board-roadmap-sync">
                    <span><Sparkles size={11} /> السبورة تتبع سير العناصر</span>
                    <strong>{roadmapSync.stageLabel} · {roadmapSync.stageShortLabel}</strong>
                    <p>{roadmapSync.formula || roadmapSync.title}</p>
                    <small>الخطوة {roadmapSync.stepIndex + 1} من {roadmapSync.totalSteps}</small>
                  </div>
                )}
                <div className="lesson-board-topic-label" aria-label={`موضوع الدرس: ${fixedLessonTitle}`}>
                  <span>موضوع الدرس</span>
                  <strong>{fixedLessonTitle}</strong>
                </div>
                <InteractiveWhiteboard
                  sectionId={activeSection.id}
                  strokes={session.whiteboardStrokesBySection[activeSection.id] ?? []}
                  mode={boardMode}
                  highlightedPart={highlightedPart}
                  groundedDiagram={Boolean(generatedLesson)}
                  animationProgress={isPlaying ? narrationProgress : 100}
                  hotspots={hotspots}
                   canvasCommands={visibleDaleelCanvasCommands}
                  disabled={!lessonToolsActive}
                  onStrokeCommitted={commitBoardStroke}
                  onRegionSelected={selectBoardRegion}
                  onSelectionComplete={(selection) => {
                    pauseNarration();
                    setBoardSelection(selection);
                     setFahimBoardTarget({
                       x: selection.x,
                       y: selection.y,
                       width: selection.width,
                       height: selection.height,
                     });
                    setBoardCopilotQuestion('');
                    setBoardCopilotAnswer('');
                    setBoardCopilotError('');
                    setBoardCopilotState('idle');
                     setBoardCopilotOpen(true);
                      if (handoffComplete && activePartner === 'dalil') {
                        void askPartner('اشرح لي مباشرة ما يظهر في هذا الجزء المحدد.', selection);
                     }
                  }}
                />
                  {(faheemActive || handoffComplete) && (
                    <WhiteboardOwlCopilot
                      state={boardCopilotState === 'asking' ? 'thinking' : isBoardCopilotListening ? 'listening' : whiteboardOwlState}
                      target={boardSelection ?? fahimBoardTarget}
                      open={boardCopilotOpen}
                      disabled={!lessonToolsActive}
                      title={`${handoffComplete && activePartner === 'dalil' ? 'دليل' : 'فهيم'} على السبورة`}
                      message={boardSelection
                        ? 'أرسلت لك اللقطة المحددة مع سؤالك، وسأربط الإجابة بما يظهر في هذه المنطقة.'
                        : 'حدد جزءًا من اللوح أو اسأل عن الفكرة الحالية، وسأشرحها خطوة بخطوة.'}
                      onOpenChange={setBoardCopilotOpen}
                      onDismiss={() => setBoardCopilotOpen(false)}
                      question={boardCopilotQuestion}
                      onQuestionChange={setBoardCopilotQuestion}
                      onSubmitQuestion={() => void askBoardCopilot()}
                      onToggleVoice={toggleBoardCopilotVoice}
                      isListening={isBoardCopilotListening}
                      answer={boardCopilotAnswer}
                      error={boardCopilotState === 'error' ? boardCopilotError : ''}
                      isAsking={boardCopilotState === 'asking'}
                    />
                  )}
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
               <span className="lesson-canvas-hint">{activeSection.id === 'graph' ? 'ميل المنحنى: Δy / Δx' : 'اكتب أو ارسم فوق اللوح'}</span>
            </div>
          </div>
          <div className="lesson-teaching-footer">
            <div className="lesson-narration" role="status" aria-live="polite">
                <button type="button" className="lesson-play-button" onClick={toggleNarration} disabled={!lessonToolsActive} aria-label={isPlaying ? 'إيقاف الشرح الصوتي' : 'تشغيل الشرح الصوتي'} data-testid="button-toggle-narration">{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
                 <div className="lesson-narration-copy"><strong>{isPlaying ? `${handoffComplete ? activePartnerDetails.name : 'فهيم'} يشرح لك بالصوت...` : 'الشرح الصوتي جاهز'}</strong><span>{isPlaying ? narrationText : 'شغّل العرض وصوته، ثم أوقفه واسأل عن أي لحظة.'}</span><div className="lesson-narration-progress"><span style={{ width: `${narrationProgress}%` }} /></div></div>
            </div>
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
                <span>{generatedExercise.format === 'comprehensive_function' || generatedExercise.format === 'comprehensive_science' ? 'ورقة عملية شاملة · فهيم يصحح المحاولة' : analysis ? 'تمرين إضافي يعالج نفس الخطأ' : 'تمرينك الآن · جرّب قبل طلب التوجيه'}</span>
               <h4><MathText>{generatedExercise.title}</MathText></h4>
                  {(
                  <>
                    <p className="lesson-generated-intro"><MathText>{generatedExercise.prompt}</MathText></p>
                    <div className="lesson-generated-meta">
                      <span>العلامة: {generatedExercise.totalPoints ?? 20} نقطة</span>
                      <span>أسئلة مترابطة · الحل بالقلم</span>
                      <span>مدة المحاولة: {Math.floor(exerciseAttemptElapsed / 60).toString().padStart(2, '0')}:{(exerciseAttemptElapsed % 60).toString().padStart(2, '0')}</span>
                    </div>
                    <div className="lesson-generated-sections">
                      {generatedExercise.sections?.map((section, index) => (
                        <section key={section.id} className="lesson-generated-section">
                          <span className="lesson-generated-section-index">{index + 1}.</span>
                          <p><MathText>{section.prompt}</MathText></p>
                        </section>
                      ))}
                    </div>
                    <div className="lesson-generated-upload">
                      <div className="lesson-generated-upload-copy">
                        <strong>اكتب الحل على الورقة ثم ارفع صورة المحاولة</strong>
                        <span>لن نطلب منك اختيار إجابة. سيقرأ فهيم خطواتك ويحدد آخر خطوة صحيحة وموضع الخطأ.</span>
                      </div>
                      <div className="lesson-generated-exercise-actions">
                        <button type="button" onClick={downloadGeneratedExercise} data-testid="button-download-generated-exercise">
                          <Download size={13} /> تنزيل الورقة
                        </button>
                        <label className="lesson-generated-upload-button" htmlFor="generated-exercise-attempt-input" data-testid="button-upload-generated-exercise">
                          <ImagePlus size={13} /> رفع صورة المحاولة
                          <input
                            id="generated-exercise-attempt-input"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleGeneratedExerciseAttempt}
                            hidden
                          />
                        </label>
                      </div>
                      {exerciseAttemptName && <small className="lesson-generated-file"><CheckCircle2 size={12} /> {exerciseAttemptName}</small>}
                      {exerciseAttemptImage && <img className="lesson-generated-attempt-preview" src={exerciseAttemptImage} alt="معاينة صورة محاولة تمرين الدوال" />}
                      {exerciseAttemptState === 'analyzing' && <p className="lesson-generated-feedback"><LoaderCircle size={13} className="lesson-spin-icon" /> فهيم يقرأ ورقة الحل...</p>}
                       {exerciseAttemptState === 'ready' && analysis && <div className="lesson-generated-analysis">
                        <strong>تم تحليل المحاولة</strong>
                        <span>آخر خطوة صحيحة: {analysis.lastCorrectStep}</span>
                        <span>موضع يحتاج مراجعة: {analysis.firstErrorStep}</span>
                        <p>{analysis.feedback}</p>
                         <button
                           type="button"
                           className="lesson-copilot-solution-button"
                           onClick={() => setPaperCopilotOpen(true)}
                           data-testid="button-open-paper-attempt-copilot"
                         >
                           ناقش المحاولة مع فهيم
                         </button>
                      </div>}
                      {exerciseAttemptState === 'error' && <p className="lesson-generated-feedback is-retry">{exerciseAttemptError || analysisError}</p>}
                    </div>
                  </>
                )}
             </div>
           )}
          </div>
          <div className="lesson-note-card">
            <div className="lesson-note-header"><strong><Save size={13} /> ملاحظتك</strong><span>{noteStatus}</span></div>
            <textarea value={session.note} onChange={(event) => { const value = event.target.value; setNoteStatus('يُحفظ الآن'); setSession((current) => ({ ...current, note: value, flowNotes: { ...current.flowNotes, [activeSection.id]: value.trim() ? `ملاحظة مرتبطة بـ«${activeSection.label}»: ${value.trim()}` : current.flowNotes[activeSection.id] } })); }} placeholder="اكتب علاقة تريد تذكرها..." aria-label="ملاحظة الدرس" data-testid="input-lesson-note" />
             <button type="button" className="lesson-save-note" onClick={() => { try { window.localStorage.setItem(sessionKey, JSON.stringify({ ...session, attachment: null })); setNoteStatus('حُفظت الملاحظة'); } catch { setNoteStatus('تعذر حفظ الملاحظة'); } }} data-testid="button-save-lesson-note"><Save size={12} /> حفظ الملاحظة</button>
              {(session.concludedAt || summarySaveState !== 'idle') && <div className="lesson-summary-status" role="status" data-testid="status-summary-bank">
                <span>{summarySaveState === 'saved' ? 'حُفظ الملخص في ملفك وبنك الملخصات.' : summarySaveState === 'saving' ? 'نحفظ ملخص الجلسة في ملفك...' : summarySaveState === 'error' ? 'حُفظ محليًا، وتعذر مزامنة بنك الملخصات.' : 'سيُحفظ ملخص الجلسة تلقائيًا.'}</span>
                 {summarySaveState === 'error' && <button type="button" onClick={() => void requestOfficialSummary()}>إعادة المزامنة</button>}
             </div>}
             {summaryPreview && <div className="lesson-summary-card" data-testid="card-session-summary">
               <div className="lesson-summary-card-header">
                  <div className="lesson-summary-brand"><img src={owlLogoPath} alt="شعار توجيه" /><span><strong>{summaryPreview.summaryTitle}</strong><small>{summaryPreview.officialStampApplied ? summaryPreview.officialStamp : 'مسودة متابعة · بانتظار الإتقان'}</small></span></div>
                 <span className="lesson-summary-progress">{summaryPreview.progress}٪</span>
               </div>
               <p>{summaryPreview.summary}</p>
                {summaryPreview.keyTakeaways.length > 0 && (
                  <ul className="lesson-summary-takeaways" aria-label="النقاط الأساسية للملخص الرسمي">
                    {summaryPreview.keyTakeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}
                  </ul>
                )}
               <div className="lesson-summary-concepts">{summaryPreview.concepts.map((concept) => <span key={concept.id}><strong>{concept.mastery}٪</strong>{concept.title}</span>)}</div>
               <div className="lesson-summary-times"><span>بدأت {formatSessionTime(summaryPreview.startedAt)}</span><span>اكتملت {formatSessionTime(summaryPreview.completedAt)}</span></div>
               {summaryPreview.progress === 100 && summarySaveState === 'saved' && <button type="button" className="lesson-unit-quiz-button" onClick={() => setLocation('/quizzes?quiz=mechanics-unit')} data-testid="button-start-unit-assessment"><Sparkles size={14} /> افتح تقييم الوحدة عالي الصعوبة</button>}
             </div>}
            {attemptBank.length > 0 && <div className="lesson-bank"><div className="lesson-bank-heading"><strong>بنك الأخطاء</strong><span>{attemptBank.length} محاولات</span></div>{attemptBank.slice(0, 2).map((item) => <button type="button" key={item.id} className="lesson-bank-item" onClick={() => { setAnalysis(item); setAnalysisState('ready'); }} data-testid={`button-open-attempt-${item.id}`}><span>{item.fileName}</span><small>{item.createdAt} · {item.summaryAnchor}</small></button>)}</div>}
       </div>
       <PaperAttemptCopilot
         open={paperCopilotOpen}
         onOpenChange={setPaperCopilotOpen}
         paperTitle={generatedExercise?.title ?? 'التمرين الورقي'}
         attemptImage={exerciseAttemptImage}
         attemptName={exerciseAttemptName}
         analysis={analysis}
         question={paperCopilotQuestion}
         onQuestionChange={setPaperCopilotQuestion}
         onAsk={() => void askPaperAttemptCopilot()}
         answer={paperCopilotAnswer}
         elapsedSeconds={exerciseAttemptElapsed}
         error={paperCopilotState === 'error' ? paperCopilotError : ''}
         isAsking={paperCopilotState === 'asking'}
       />
        </section>
      </div>
    </section>
  );
}