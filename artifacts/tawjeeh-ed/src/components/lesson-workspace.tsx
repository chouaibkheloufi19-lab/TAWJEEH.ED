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
  const [fahimResponse, setFahimResponse] = useState<FahimResponse | null>(null);
  const [fahimBoardTarget, setFahimBoardTarget] = useState<WhiteboardOwlTarget | null>(null);
  const [isBoardImmersive, setIsBoardImmersive] = useState(false);
  const [isLessonRailCollapsed, setIsLessonRailCollapsed] = useState(false);
  const [roadmapSync, setRoadmapSync] = useState<LessonBoardSync | null>(null);
  const [activePartner, setActivePartner] = useState<ActivePartner>('dalil');
  const [exerciseAnswer, setExerciseAnswer] = useState('');
  const [exerciseFeedback, setExerciseFeedback] = useState<'correct' | 'retry' | null>(null);
  const [showExerciseHint, setShowExerciseHint] = useState(false);
  const [showExerciseSolution, setShowExerciseSolution] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const whiteboardImageInputRef = useRef<HTMLInputElement>(null);
  const owlVideoRef = useRef<HTMLVideoElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const copilotSpeechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
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
    officialStamp: 'TAWJEEH.ED · OFFICIAL',
    logo: 'tawjeeh-owl-transparent.png',
    groundingQuery: agentReadinessQuery.data?.retrieval.query ?? '',
    groundingNodeIds: agentReadinessQuery.data?.retrieval.retrievedNodeIds ?? [],
  });

  const syncSummary = (summary: LocalSummary, state: 'saving' | 'saved' | 'error' = 'saving') => {
    saveSummaryToProfile(summary);
    setSummaryPreview(summary);
    setSummarySaveState(state);
    completeLessonMutation.mutate({
      lessonId,
      data: {
        lesson_id: lessonId,
        lesson_title: summary.lessonTitle,
        subject: summary.subject,
        summary: summary.summary,
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
    if (!ragReady || session.concludedAt) return;
    const timeout = window.setTimeout(() => {
      syncSummary(buildSessionSummary(new Date().toISOString()));
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
       const utterance = new SpeechSynthesisUtterance(narrationText);
      utterance.lang = 'ar-SA';
      utterance.rate = .92;
      utterance.onboundary = (event) => {
         const length = narrationText.length || 1;
        setNarrationProgress(Math.min(100, Math.round((event.charIndex / length) * 100)));
      };
      utterance.onend = () => setNarrationProgress(100);
      window.speechSynthesis.speak(utterance);
    }
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, [isPlaying, narrationText]);

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
    setExerciseAnswer('');
    setExerciseFeedback(null);
    setShowExerciseHint(false);
    setShowExerciseSolution(false);
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
    document.body.style.overflow = isBoardImmersive || isTopicImmersive ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isBoardImmersive, isTopicImmersive]);

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
       setTopicAnalysis(generated.solutionSummary);
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
           text: completedTopic
             ? `حللت معطيات «${completedTopic.title}» وفتحت لك الموضوع التالي مباشرة: «${(generated.ideas.find((idea) => idea.title !== completedTopic.title) ?? generated.ideas[0]).title}».`
             : `بنى لك وكيل التمارين ${generated.ideas.length} موضوعات مختلفة من مصادر المنهاج. افتح أي موضوع لبدء دراسته في مساحة كاملة.`,
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
      if (activePartner === 'dalil') {
        const daleelQuestion = boardSelection
          ? `اشرح لي مباشرة ما يظهر في المنطقة المحددة من السبورة. ${cleanText}`
          : cleanText;
        const teachingContent = [
          `الشرح الحالي: ${displayedExplanation}`,
          `الفكرة المميزة: ${displayedHighlight}`,
          generatedLesson?.elements.map((element) => `${element.title}: ${element.summary}`).join('\n') ?? '',
          sourceExcerpt,
        ].filter(Boolean).join('\n');
        const daleelRequest = {
          lesson_title: fixedLessonTitle,
          level: '3AS',
          question: daleelQuestion,
          content: teachingContent,
          mastery: progress >= 100,
          ...(boardSelection
            ? {
                highlighted_region: {
                  x: boardSelection.x,
                  y: boardSelection.y,
                  width: boardSelection.width,
                  height: boardSelection.height,
                },
              }
            : {}),
        };
        const response = await fetchWithTimeout('/api/ai/daleel', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(daleelRequest),
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
        if (boardSelection) {
          setFahimBoardTarget({
            x: boardSelection.x,
            y: boardSelection.y,
            width: boardSelection.width,
            height: boardSelection.height,
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
        setBoardCopilotOpen(Boolean(boardSelection));
        setIsPlaying(true);
        setMessages((current) => [...current, {
          id: `daleel-answer-${Date.now()}`,
          role: 'assistant',
          text: daleel.speech_text,
        }]);
        if (daleel.summary_data.official_stamp_applied && progress >= 100 && !session.concludedAt) {
          concludeSession(daleel.summary_data);
        }
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
          lesson: fixedLessonTitle,
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
    setFahimBoardTarget(null);
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

  const selectBoardRegion = (region: typeof hotspots[number]) => {
    pauseNarration();
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
    if (!boardSelection || !boardCopilotQuestion.trim() || boardCopilotState === 'asking') return;
    const questionText = boardCopilotQuestion.trim();
    setBoardCopilotState('asking');
    setBoardCopilotError('');
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
              <button type="button" className="lesson-conclude-button" onClick={() => concludeSession()} disabled={!evaluationComplete || !ragReady} data-testid="button-conclude-lesson">
              <CheckCircle2 size={14} /> إنهاء وحفظ الملخص
              </button>
              {evaluationBlocker && <span className="lesson-evaluation-blocker">{evaluationBlocker}</span>}
            </div>
          )}
        </div>
      </header>

      <div className="lesson-sync-strip" role="status" data-testid="status-live-sync">
        <span className={summarySaveState === 'error' ? 'is-error' : summarySaveState === 'saving' ? 'is-saving' : ''}>
          <CheckCircle2 size={14} />
          {summarySaveState === 'error' ? 'تحتاج المزامنة إلى إعادة المحاولة' : summarySaveState === 'saving' ? 'تُحفظ التغييرات الآن' : 'المزامنة الحية مفعّلة'}
        </span>
        <strong>السبورة ↔ بنك الملخصات</strong>
        <small>{whiteboardAssets.length} عناصر محفوظة · {Object.keys(session.flowNotes).length} خطوات موثقة · كل تغيير يُربط تلقائيًا</small>
      </div>

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

      {fahimResponse && faheemActive && (
        <section className="lesson-fahim-diagnostic" aria-label="آخر تقييم من فهيم" data-testid="card-fahim-diagnostic">
          <div className="lesson-fahim-diagnostic-main">
            <span className="lesson-panel-kicker"><BrainCircuit size={13} /> قراءة فهيم الحالية</span>
            <strong>{fahimResponse.evaluated_skill}</strong>
            <p>{fahimResponse.chat_response}</p>
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
                  <span className="lesson-path-copy"><strong>{section.label}</strong><small>{active ? displayedTitle : section.shortLabel}</small>{source && <em>من {source.source}</em>}</span>
                  {active && <span className="lesson-path-current" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className="lesson-path-note"><Lightbulb size={15} /><span>المحتوى مرتبط ببطاقات المعرفة المصدرية، وتظهر الإحالة عند توفرها.</span></div>
           <div className="lesson-activity-log" aria-label="سجل نشاط سير العناصر" data-testid="panel-activity-log">
             <div className="lesson-activity-log-heading"><span><MessageCircle size={13} /> ما يُدوّن على سير العناصر</span><small>يتحدّث مع كل خطوة</small></div>
             <div className="lesson-activity-log-list">
               {lessonSections.map((section) => (
                 <div className={`lesson-activity-log-item ${section.id === activeSection.id ? 'is-active' : ''}`} key={section.id}>
                   <span>{section.label}</span>
                   <p>{session.flowNotes[section.id] || 'بانتظار أول تفاعل في هذه الخطوة.'}</p>
                 </div>
               ))}
             </div>
           </div>
          {knowledgeQuery.isLoading && <p className="lesson-source-status"><LoaderCircle size={13} /> نتحقق من مصادر الدرس...</p>}
          {knowledgeQuery.isError && <p className="lesson-source-status is-error">تعذر تحميل الإحالات؛ بقيت أدوات الجلسة متاحة.</p>}
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
                       <button type="button" className="lesson-creative-ask" onClick={() => openCreativeTopic(idea)} disabled={isThinking} data-testid={`button-ask-creative-topic-${index + 1}`}>
                         <Maximize2 size={12} /> افتح الموضوع والكوبيلوت
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
             role={isBoardImmersive ? 'dialog' : undefined}
           >
          <div className="lesson-teaching-header">
             <div>
                 <span className="lesson-panel-kicker"><Volume2 size={13} /> طبقة 3 · {handoffComplete ? 'السبورة والمواضيع' : 'السبورة الحية'}</span>
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
            <section className={`lesson-topic-studio ${topicStudioOpen ? 'is-open' : ''}`} aria-label="موضوع الدرس وتوليده">
              <div className="lesson-topic-studio-head">
                <div>
                   <span className="lesson-topic-kicker"><BookOpen size={12} /> الخطوة الأولى · افهم الموضوع</span>
                    <h3>مساحة بناء الموضوع</h3>
                   <p>ثلاث خطوات صغيرة تفصلك عن بداية الحل. لا تشتت نفسك بين البطاقات؛ اتبع المسار من الأعلى إلى الأسفل.</p>
                </div>
                <button type="button" className="lesson-topic-toggle" onClick={() => setTopicStudioOpen((open) => !open)} aria-expanded={topicStudioOpen} data-testid="button-toggle-topic-studio">
                  {topicStudioOpen ? 'طي الموضوع' : 'عرض الموضوع'}
                </button>
              </div>
              {topicStudioOpen && (
                <div className="lesson-topic-studio-body">
                   <div className="lesson-topic-meta" aria-label="ملخص الموضوع">
                     <span><b>الموضوع</b>{fixedLessonTitle}</span>
                     <span><b>المستوى</b>السنة الثالثة ثانوي</span>
                     <span><b>المصادر</b>{foundationalSources.length || '—'} مكتسبات مرتبطة</span>
                  </div>
                   <div className="lesson-topic-brief" aria-label="مسار إنجاز الموضوع">
                     <div><span className="lesson-topic-brief-index">01</span><strong>افهم المطلوب</strong><span>فسّر القصور الذاتي والقوة المحصلة، ثم اربطهما بالتسارع في وضعية حركة واقعية.</span></div>
                     <div><span className="lesson-topic-brief-index">02</span><strong>ابنِ الحل</strong><span>استخرج المعطيات، اختر القانون المناسب، وبرّر كل نتيجة قبل الانتقال.</span></div>
                     <div><span className="lesson-topic-brief-index">03</span><strong>ثبّت الفكرة</strong><span>اختر تطبيقًا من القائمة، ثم اسأل فهيم عن أي خطوة توقفت عندها.</span></div>
                  </div>
                  {topicForStudio && (
                     <article className="lesson-topic-featured" data-testid="card-featured-topic">
                      <div className="lesson-topic-featured-copy">
                         <span><Sparkles size={12} /> الخطوة التالية · اختر تطبيقًا واحدًا</span>
                        <h4>{topicForStudio.title}</h4>
                        <p>{topicForStudio.approach}</p>
                        <div className="lesson-topic-featured-meta">
                          <span>{topicForStudio.steps.length} خطوات</span>
                          <span>مبني على المصادر</span>
                          <span>اضغط للتركيز</span>
                        </div>
                      </div>
                       <button type="button" className="lesson-topic-open-button" onClick={() => openCreativeTopic(topicForStudio)} data-testid="button-open-featured-topic">
                         <Maximize2 size={14} /> ابدأ بهذا الموضوع
                      </button>
                    </article>
                  )}
                  {creativeIdeas && (
                     <div className="lesson-topic-options" aria-label="الموضوعات المتاحة">
                       <div className="lesson-topic-options-heading"><span>موضوعات أخرى</span><small>اختر ما يناسبك</small></div>
                       <div className="lesson-topic-mini-list">
                      {creativeIdeas.ideas.map((idea, index) => (
                        <button
                          type="button"
                          key={`${idea.title}-${index}`}
                          className={`lesson-topic-mini-item ${topicForStudio?.title === idea.title ? 'is-active' : ''}`}
                          onClick={() => openCreativeTopic(idea)}
                          data-testid={`button-open-topic-${index + 1}`}
                        >
                          <span>{index + 1}</span>
                          <strong>{idea.title}</strong>
                           <small>اختيار</small>
                        </button>
                      ))}
                       </div>
                    </div>
                  )}
                  <div className="lesson-topic-actions">
                    <button type="button" className="lesson-topic-primary" onClick={() => void generateCreativeTopic()} disabled={!lessonToolsActive || isThinking || chatCircuitOpen} data-testid="button-generate-topic-creative">
                       {isThinking ? <LoaderCircle size={13} className="lesson-spin-icon" /> : <Sparkles size={13} />} ولّد 3 تطبيقات جديدة
                    </button>
                     <button type="button" className="lesson-topic-secondary" onClick={() => topicForStudio ? openCreativeTopic(topicForStudio) : setLocation('/exam-preview')} data-testid="button-open-full-topic">
                        <Maximize2 size={13} /> افتح مساحة التركيز
                    </button>
                  </div>
                  <form className="lesson-copilot-form" onSubmit={(event) => { event.preventDefault(); void askCopilotQuestion(copilotQuestion); }}>
                    <div>
                       <span className="lesson-copilot-label"><MessageCircle size={13} /> توقفت في خطوة؟</span>
                      <small>{selectedCreativeTopic ? `يساعدك الآن في: ${selectedCreativeTopic.title}` : 'اكتب سؤالك قبل أن تبدأ التطبيق'}</small>
                    </div>
                    <input value={copilotQuestion} onChange={(event) => setCopilotQuestion(event.target.value)} disabled={!lessonToolsActive || isThinking || chatCircuitOpen} placeholder="مثال: كيف أختار القانون المناسب في الوضعية؟" aria-label="سؤال الكوبيلوت عن الموضوع" data-testid="input-topic-copilot-question" />
                    <button type="submit" disabled={!lessonToolsActive || !copilotQuestion.trim() || isThinking || chatCircuitOpen} aria-label="إرسال سؤال الكوبيلوت" data-testid="button-send-topic-copilot"><Send size={15} /></button>
                  </form>
                </div>
              )}
            </section>
            {isTopicImmersive && topicForStudio && (
              <div className="lesson-topic-immersive" role="presentation">
                <section className="lesson-topic-immersive-card" role="dialog" aria-modal="true" aria-label={`موضوع ${topicForStudio.title}`} data-testid="dialog-topic-immersive">
                  <header className="lesson-topic-immersive-head">
                    <div>
                      <span className="lesson-topic-kicker"><BookOpen size={13} /> مساحة الموضوع · وكيل التمارين</span>
                      <h3>{topicForStudio.title}</h3>
                      <p>اقرأ المعطيات، ظلّل أي جزء، ثم اطلب من الكوبيلوت أن يبني عليه أسئلة.</p>
                    </div>
                    <button type="button" className="lesson-topic-close" onClick={() => setIsTopicImmersive(false)} aria-label="إغلاق مساحة الموضوع" data-testid="button-close-topic-immersive"><X size={18} /></button>
                  </header>
                  <div className="lesson-topic-immersive-grid">
                    <article
                      className="lesson-topic-paper"
                      onMouseUp={captureSelectedTopicText}
                      onTouchEnd={captureSelectedTopicText}
                      data-testid="article-topic-paper"
                    >
                      <div className="lesson-topic-paper-label"><span>موضوع تطبيقي</span><small>تحديد ذكي مفعّل</small></div>
                      <h4>{topicForStudio.title}</h4>
                      <div className="lesson-topic-data-block">
                        <strong>الوضعية والمعطيات</strong>
                        <p>{topicForStudio.situation || topicForStudio.approach}</p>
                        <ul>
                          {topicForStudio.steps.slice(0, 3).map((step, index) => <li key={`${topicForStudio.title}-full-step-${index}`}>{step}</li>)}
                        </ul>
                      </div>
                      <div className="lesson-topic-data-block">
                        <strong>المطلوب</strong>
                        <p>{topicForStudio.required || topicForStudio.expectedOutcome}</p>
                      </div>
                      <div className="lesson-topic-challenge">
                        <strong>التحدّي الخاص</strong>
                        <p>{topicForStudio.challenge || topicForStudio.creativeTwist}</p>
                      </div>
                      {selectedTopicExcerpt && (
                        <div className="lesson-topic-selection" role="status" data-testid="status-selected-topic-excerpt">
                          <span>الجزء المحدد</span>
                          <p>«{selectedTopicExcerpt}»</p>
                          <button type="button" onClick={askAboutSelectedTopicExcerpt} disabled={isThinking || chatCircuitOpen} data-testid="button-ask-selected-topic">
                            <MessageCircle size={13} /> اطرح أسئلة على الجزء المحدد
                          </button>
                        </div>
                      )}
                      <small className="lesson-topic-selection-hint">اسحب لتحديد جملة أو معطى داخل الموضوع.</small>
                    </article>
                    <aside className="lesson-topic-immersive-side">
                      <div className="lesson-topic-analysis-card">
                        <span><BrainCircuit size={13} /> تحليل المعطيات قبل التقدم</span>
                        <strong>{topicCompletionState === 'analyzing' ? 'أحلل الموضوع وأبحث عن التالي...' : 'نقطة البدء واضحة'}</strong>
                        <p>{topicAnalysis || 'ابدأ من الوضعية، استخرج ما هو معلوم، ثم اربط كل خطوة بالمطلوب قبل اختيار القانون.'}</p>
                        <div className="lesson-topic-analysis-points">
                          <span><b>1</b> المعطيات</span>
                          <span><b>2</b> المطلوب</span>
                          <span><b>3</b> العائق</span>
                        </div>
                      </div>
                      <form className="lesson-topic-immersive-copilot" onSubmit={(event) => { event.preventDefault(); void askCopilotQuestion(copilotQuestion, topicForStudio, selectedTopicExcerpt); }}>
                        <div className="lesson-copilot-label"><MessageCircle size={13} /> كوبيلوت خفيف</div>
                        <p>اسأل عن معنى، خطوة، معطى، أو اطلب سؤالًا جديدًا على الجزء المحدد.</p>
                        <textarea value={copilotQuestion} onChange={(event) => setCopilotQuestion(event.target.value)} disabled={isThinking || chatCircuitOpen} placeholder="مثال: ما أول سؤال يجب أن أطرحه على هذه المعطيات؟" rows={4} aria-label="سؤال كوبيلوت الموضوع" data-testid="input-immersive-topic-copilot" />
                        <button type="submit" disabled={!copilotQuestion.trim() || isThinking || chatCircuitOpen} data-testid="button-send-immersive-topic-copilot">
                          {isThinking ? <LoaderCircle size={14} className="lesson-spin-icon" /> : <Send size={14} />} أجبني عن الموضوع
                        </button>
                      </form>
                      <button type="button" className="lesson-topic-complete-button" onClick={() => void completeCreativeTopic()} disabled={isThinking || chatCircuitOpen} data-testid="button-complete-topic">
                        {topicCompletionState === 'analyzing' ? <LoaderCircle size={14} className="lesson-spin-icon" /> : <ArrowLeft size={14} />}
                        {topicCompletionState === 'analyzing' ? 'تحليل المعطيات وتوليد التالي...' : 'أنهيت الموضوع · افتح التالي'}
                      </button>
                      {topicCompletionState === 'advanced' && <p className="lesson-topic-advance-status" role="status" data-testid="status-topic-advanced">تم تحليل الموضوع وفتح موضوع جديد لك مباشرة.</p>}
                      {topicCompletionState === 'error' && <p className="lesson-topic-advance-status is-error" role="alert">تعذر توليد الموضوع التالي الآن. أعد المحاولة.</p>}
                    </aside>
                  </div>
                </section>
              </div>
            )}
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
                 <span><BarChart3 size={14} /> السبورة الحية · اضغط على أي جزء لتلقين فهيم</span>
              <div>
                <button type="button" className={boardMode === 'pen' ? 'is-selected' : ''} onClick={() => setBoardMode('pen')} disabled={!lessonToolsActive} aria-label="أداة الكتابة" data-testid="button-whiteboard-pen"><PenLine size={15} /></button>
                  <button type="button" className={boardMode === 'highlight' ? 'is-selected' : ''} onClick={() => setBoardMode('highlight')} disabled={!lessonToolsActive} aria-label="أداة التظليل والنقر" data-testid="button-whiteboard-highlight"><Highlighter size={15} /></button>
                  <button type="button" className={boardMode === 'select' ? 'is-selected' : ''} onClick={() => setBoardMode('select')} disabled={!lessonToolsActive} aria-label="أداة تحديد جزء وسؤال فهيم" data-testid="button-whiteboard-select"><ScanSearch size={15} /></button>
                 <button type="button" onClick={clearBoard} disabled={!lessonToolsActive} aria-label="مسح الكتابة" data-testid="button-whiteboard-clear"><Eraser size={15} /></button>
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
                   canvasCommands={daleelCanvasCommands}
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
                       void askPartner('اشرح لي مباشرة ما يظهر في هذا الجزء المحدد.');
                     }
                  }}
                />
                {boardSelection && (
                  <button
                    type="button"
                    className="lesson-whiteboard-copilot"
                    style={{
                      left: `${Math.min(88, Math.max(12, (boardSelection.x + boardSelection.width / 2) * 100))}%`,
                      top: `${Math.min(82, Math.max(18, (boardSelection.y + boardSelection.height / 2) * 100))}%`,
                    }}
                    onClick={() => setBoardCopilotOpen(true)}
                     aria-label={`اسأل ${handoffComplete && activePartner === 'dalil' ? 'دليل' : 'فهيم'} عن الجزء المحدد`}
                    data-testid="button-open-whiteboard-copilot"
                  >
                    <img src={owlAgentViolet} alt="" />
                    <span>اسأل فهيم</span>
                  </button>
                )}
                {boardCopilotOpen && boardSelection && (
                  <div className="lesson-whiteboard-copilot-modal" role="dialog" aria-modal="true" aria-label="كوبيلوت السبورة" data-testid="dialog-whiteboard-copilot">
                     <div className="lesson-whiteboard-copilot-head">
                       <div><img src={owlAgentViolet} alt="" /><span><strong>{handoffComplete && activePartner === 'dalil' ? 'دليل على السبورة' : 'فهيم على السبورة'}</strong><small>{handoffComplete && activePartner === 'dalil' ? 'شرح فوري للجزء الذي حددته' : 'اسأل عن الجزء الذي حددته'}</small></span></div>
                      <button type="button" onClick={() => setBoardCopilotOpen(false)} aria-label="إغلاق كوبيلوت السبورة"><X size={15} /></button>
                    </div>
                    <form onSubmit={(event) => { event.preventDefault(); void askBoardCopilot(); }}>
                      <textarea
                        value={boardCopilotQuestion}
                        onChange={(event) => setBoardCopilotQuestion(event.target.value)}
                         placeholder={handoffComplete && activePartner === 'dalil' ? 'سيشرح دليل هذا الجزء مباشرة...' : 'مثال: لماذا يتغير الميل هنا؟'}
                        rows={3}
                        disabled={boardCopilotState === 'asking'}
                         aria-label={`سؤال ${handoffComplete && activePartner === 'dalil' ? 'دليل' : 'فهيم'} عن الجزء المحدد`}
                        data-testid="input-whiteboard-copilot-question"
                      />
                      <div className="lesson-whiteboard-copilot-actions">
                        <button type="button" onClick={toggleBoardCopilotVoice} disabled={boardCopilotState === 'asking'} aria-label={isBoardCopilotListening ? 'إيقاف الإملاء' : 'إملاء السؤال'}>
                          {isBoardCopilotListening ? <MicOff size={14} /> : <Mic size={14} />}
                        </button>
                        <button type="submit" disabled={!boardCopilotQuestion.trim() || boardCopilotState === 'asking'}>{boardCopilotState === 'asking' ? <LoaderCircle size={14} className="lesson-spin-icon" /> : <Send size={14} />} اسأل</button>
                      </div>
                    </form>
                    {boardCopilotState === 'error' && <p className="lesson-whiteboard-copilot-error" role="alert">{boardCopilotError}</p>}
                    {boardCopilotAnswer && <div className="lesson-whiteboard-copilot-answer" role="status"><strong>الإجابة</strong><p>{boardCopilotAnswer}</p></div>}
                  </div>
                )}
                 {fahimBoardTarget && (faheemActive || (handoffComplete && activePartner === 'dalil')) && (
                  <WhiteboardOwlCopilot
                    state={whiteboardOwlState}
                    target={fahimBoardTarget}
                    open
                     title={handoffComplete && activePartner === 'dalil' ? 'دليل يتابع هذا الموضع' : 'فهيم يتابع هذا الموضع'}
                     message={handoffComplete && activePartner === 'dalil' ? (daleelResponse?.speech_text || 'حددت موضعًا مهمًا على السبورة. أشرح لك فكرته الآن.') : (fahimResponse?.speech_text || 'حددت موضعًا مهمًا على السبورة. نراجعه خطوةً خطوة.')}
                     actionLabel="تثبيت الموضع"
                    onAsk={() => setBoardMode('highlight')}
                    onDismiss={() => setFahimBoardTarget(null)}
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
              <span className="lesson-canvas-hint">{activeSection.id === 'graph' ? 'الميل يروي قصة الحركة' : 'اكتب أو ارسم فوق اللوح'}</span>
            </div>
          </div>
          <div className="lesson-teaching-footer">
            <div className="lesson-narration" role="status" aria-live="polite">
                <button type="button" className="lesson-play-button" onClick={toggleNarration} disabled={!lessonToolsActive} aria-label={isPlaying ? 'إيقاف الشرح الصوتي' : 'تشغيل الشرح الصوتي'} data-testid="button-toggle-narration">{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
                 <div className="lesson-narration-copy"><strong>{isPlaying ? `${handoffComplete ? activePartnerDetails.name : 'فهيم'} يشرح لك بالصوت...` : 'الشرح الصوتي جاهز'}</strong><span>{isPlaying ? narrationText : 'شغّل العرض وصوته، ثم أوقفه واسأل عن أي لحظة.'}</span><div className="lesson-narration-progress"><span style={{ width: `${narrationProgress}%` }} /></div></div>
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
            <textarea value={session.note} onChange={(event) => { const value = event.target.value; setNoteStatus('يُحفظ الآن'); setSession((current) => ({ ...current, note: value, flowNotes: { ...current.flowNotes, [activeSection.id]: value.trim() ? `ملاحظة مرتبطة بـ«${activeSection.label}»: ${value.trim()}` : current.flowNotes[activeSection.id] } })); }} placeholder="اكتب علاقة تريد تذكرها..." aria-label="ملاحظة الدرس" data-testid="input-lesson-note" />
             <button type="button" className="lesson-save-note" onClick={() => { try { window.localStorage.setItem(sessionKey, JSON.stringify({ ...session, attachment: null })); setNoteStatus('حُفظت الملاحظة'); } catch { setNoteStatus('تعذر حفظ الملاحظة'); } }} data-testid="button-save-lesson-note"><Save size={12} /> حفظ الملاحظة</button>
              {(session.concludedAt || summarySaveState !== 'idle') && <div className="lesson-summary-status" role="status" data-testid="status-summary-bank">
                <span>{summarySaveState === 'saved' ? 'حُفظ الملخص في ملفك وبنك الملخصات.' : summarySaveState === 'saving' ? 'نحفظ ملخص الجلسة في ملفك...' : summarySaveState === 'error' ? 'حُفظ محليًا، وتعذر مزامنة بنك الملخصات.' : 'سيُحفظ ملخص الجلسة تلقائيًا.'}</span>
                {summarySaveState === 'error' && <button type="button" onClick={() => concludeSession(undefined, true)}>إعادة المزامنة</button>}
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