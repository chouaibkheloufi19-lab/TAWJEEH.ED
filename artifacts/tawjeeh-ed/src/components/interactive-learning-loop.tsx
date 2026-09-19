import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Lightbulb,
  LoaderCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import type { KnowledgeCard } from '@workspace/api-client-react';
import { MathText } from '@/components/math-text';

type LoopSection = {
  id: string;
  label: string;
  title: string;
  explanation: string;
  highlight: string;
};

type ConceptStep = {
  title: string;
  detail: string;
  formula: string;
  visual: 'flow' | 'equation' | 'graph' | 'highlight';
  graphPoints?: Array<{ x: number; y: number; label?: string }>;
};

export type RoadmapStageId = 'intro' | 'concept' | 'formula' | 'example';

export type LessonBoardSync = {
  stage: RoadmapStageId;
  stageLabel: string;
  stageShortLabel: string;
  sectionId: string;
  phase: LoopPhase;
  stepIndex: number;
  totalSteps: number;
  title: string;
  detail: string;
  formula: string;
  visual: ConceptStep['visual'];
};

type GroundedLesson = {
  explanation: string;
  highlight: string;
  elements: Array<{ id: string; title: string; kind: string; summary: string }>;
  graph?: {
    type: 'line' | 'bar' | 'none';
    title: string;
    xLabel: string;
    yLabel: string;
    points: Array<{ x: number; y: number; label?: string }>;
  };
  sourceDocuments: Array<{ title: string; source: string; page: number }>;
  sourceNodeIds: string[];
};

type GroundedExercise = {
  title: string;
  prompt: string;
  sourceDocuments?: Array<{ title: string; source: string; page: number }>;
  sourceNodeIds?: string[];
};

type LoopPhase = 'explain' | 'practice';

type InteractiveLearningLoopProps = {
  lessonTitle: string;
  subject: string;
  section: LoopSection;
  resources: KnowledgeCard[];
  fallbackResource?: KnowledgeCard | null;
  groundedLesson?: GroundedLesson | null;
  groundedExercise?: GroundedExercise | null;
  onBoardSync?: (sync: LessonBoardSync) => void;
};

const sectionKeywords: Record<string, string[]> = {
  definition: ['تعريف', 'مفهوم', 'قصور', 'قوة', 'حركة', 'قانون'],
  'worked-example': ['تمرين', 'مثال', 'تطبيق', 'حساب', 'حل'],
  graph: ['منحنى', 'بياني', 'تمثيل', 'ميل', 'سرعة', 'موضع'],
  practice: ['تمرين', 'مسألة', 'اختبار', 'تطبيق', 'سؤال'],
  recap: ['قانون', 'خلاصة', 'مراجعة', 'ملخص', 'مفهوم'],
};

const formulaBySection: Record<string, string> = {
  definition: 'الفكرة ← أثرها في الحركة',
  'worked-example': 'ΣF⃗ = m × a⃗',
  graph: 'الميل = Δx ÷ Δt',
  practice: 'ΣF⃗ = ∑ القوى المؤثرة',
  recap: 'F = m × a',
};

const roadmapStages: Array<{ id: RoadmapStageId; label: string; shortLabel: string; description: string }> = [
  { id: 'intro', label: 'المقدمة', shortLabel: 'Intro', description: 'نفتح السؤال ونحدد المعطى.' },
  { id: 'concept', label: 'المفهوم', shortLabel: 'Concept', description: 'نسمي الفكرة المركزية.' },
  { id: 'formula', label: 'العلاقة', shortLabel: 'Formula', description: 'نثبت العلاقة أو القاعدة.' },
  { id: 'example', label: 'المثال', shortLabel: 'Example', description: 'نطبق ونتحقق.' },
];

function roadmapIndexForStage(stage: RoadmapStageId, totalSteps: number): number {
  if (totalSteps <= 1) return 0;
  if (stage === 'intro') return 0;
  if (stage === 'concept') return Math.min(1, totalSteps - 1);
  if (stage === 'formula') return Math.min(2, totalSteps - 1);
  return totalSteps - 1;
}

function roadmapStageForStep(phase: LoopPhase, stepIndex: number, totalSteps: number): RoadmapStageId {
  if (stepIndex <= 0) return 'intro';
  if (totalSteps <= 2) return stepIndex >= totalSteps - 1 ? 'formula' : 'concept';
  if (stepIndex === 1) return 'concept';
  if (stepIndex === 2) return 'formula';
  return 'example';
}

function normalizeArabic(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}×÷=+\-./ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceText(resource: KnowledgeCard): string {
  return resource.summary.replace(/\s+/g, ' ').trim();
}

function extractFormula(text: string): string {
  const match = text.match(/[^.!؟\n]{0,55}[=×÷][^.!؟\n]{0,55}/);
  return match?.[0]?.replace(/\s+/g, ' ').trim() ?? '';
}

function scoreResource(resource: KnowledgeCard, section: LoopSection, lessonTitle: string): number {
  const haystack = normalizeArabic([
    resource.title,
    resource.lesson,
    resource.unit,
    resource.type,
    resource.tags.join(' '),
    resource.summary,
  ].join(' '));
  const terms = [
    ...sectionKeywords[section.id] ?? [],
    section.title,
    section.highlight,
    lessonTitle,
  ].map(normalizeArabic);
  return terms.reduce((score, term) => score + (term && haystack.includes(term) ? 1 : 0), 0)
    + (resource.type === 'exercise' || resource.type === 'assessment' ? 2 : 0)
    + Math.min(Math.floor(resource.summary.length / 280), 2);
}

function buildConceptSteps(
  section: LoopSection,
  resource: KnowledgeCard,
  groundedLesson?: GroundedLesson | null,
): ConceptStep[] {
  const groundedElements = groundedLesson?.elements
    .filter((element) => element.title.trim() && element.summary.trim())
    .slice(0, 6) ?? [];
  if (groundedElements.length) {
    return groundedElements.map((element, index) => {
      const isGraph = element.kind === 'graph' && groundedLesson?.graph?.points.length;
      const formula = extractFormula(element.summary)
        || (index === groundedElements.length - 1 ? groundedLesson?.highlight : '')
        || (element.kind === 'definition' ? groundedLesson?.highlight : '')
        || formulaBySection[section.id]
        || 'افهم → طبّق → تحقّق';
      return {
        title: element.title,
        detail: element.summary.replace(/\s+/g, ' ').trim(),
        formula,
        visual: isGraph ? 'graph' : element.kind === 'definition' ? 'highlight' : element.kind === 'recap' ? 'flow' : 'equation',
        graphPoints: isGraph ? groundedLesson?.graph?.points : undefined,
      };
    });
  }
  const excerpt = sourceText(resource).slice(0, 220);
  const formula = formulaBySection[section.id] ?? `${section.highlight} ← من السند إلى الفهم`;
  const common = [
      {
        title: 'نقرأ الوضعية',
        detail: `نبدأ من المعطيات المرتبطة بـ«${section.title}»، ثم نحدد ما الذي يطلبه السؤال.`,
        formula: `المعطيات → ${section.highlight}`,
      visual: 'highlight' as const,
    },
    {
      title: 'نسمّي الفكرة',
      detail: section.explanation,
      formula: `${section.highlight} = الفكرة المركزية`,
      visual: 'flow' as const,
    },
    {
      title: 'نربطها بالعلاقة',
      detail: `نحوّل العبارة إلى علاقة قابلة للاستخدام، ثم نتحقق من اتجاهها ووحداتها قبل الحساب.`,
      formula,
      visual: 'equation' as const,
    },
    {
      title: 'نختبر الفهم',
      detail: 'نغلق الشرح على سؤال قصير يثبت الفكرة قبل الانتقال إلى التطبيق.',
      formula: 'افهم → طبّق → تحقّق',
      visual: 'graph' as const,
    },
  ];
  return common;
}

export function InteractiveLearningLoop({
  lessonTitle,
  subject,
  section,
  resources,
  fallbackResource,
  groundedLesson,
  groundedExercise,
  onBoardSync,
}: InteractiveLearningLoopProps) {
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [phase, setPhase] = useState<LoopPhase>('explain');
  const [activeStep, setActiveStep] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);

  const matchedResources = useMemo(() => {
    const candidates = resources.length ? resources : fallbackResource ? [fallbackResource] : [];
    return [...candidates]
      .map((resource, index) => ({
        resource,
        score: scoreResource(resource, section, lessonTitle),
        index,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ resource }) => resource)
      .filter((resource, index, list) => list.findIndex((item) => item.id === resource.id) === index)
      .slice(0, 8);
  }, [fallbackResource, lessonTitle, resources, section]);

  const selectedResource = useMemo(
    () => matchedResources.find((resource) => resource.id === selectedResourceId) ?? matchedResources[0] ?? fallbackResource ?? null,
    [fallbackResource, matchedResources, selectedResourceId],
  );
  const conceptSteps = useMemo(
    () => selectedResource ? buildConceptSteps(section, selectedResource, groundedLesson) : [],
    [groundedLesson, section, selectedResource],
  );
  const activeBoardStep = conceptSteps[activeStep];
  const explanationComplete = phase !== 'explain' || activeStep >= conceptSteps.length - 1;
  const activeStepIndex = activeStep;
  const activeStepTotal = conceptSteps.length;
  const currentRoadmapStage = roadmapStageForStep(phase, activeStepIndex, activeStepTotal);
  const currentRoadmapStageIndex = roadmapStages.findIndex((stage) => stage.id === currentRoadmapStage);
  const boardSync = useMemo<LessonBoardSync | null>(() => {
    if (!activeBoardStep || !activeStepTotal) return null;
    const stage = roadmapStages.find((item) => item.id === currentRoadmapStage) ?? roadmapStages[0];
    return {
      stage: stage.id,
      stageLabel: stage.label,
      stageShortLabel: stage.shortLabel,
      sectionId: section.id,
      phase,
      stepIndex: activeStepIndex,
      totalSteps: activeStepTotal,
      title: activeBoardStep.title,
      detail: activeBoardStep.detail,
      formula: activeBoardStep.formula,
      visual: activeBoardStep.visual,
    };
  }, [activeBoardStep, activeStepIndex, activeStepTotal, currentRoadmapStage, phase, section.id]);

  useEffect(() => {
    if (!isStreaming || !conceptSteps.length) return;
    const timer = window.setInterval(() => {
      setActiveStep((current) => {
        if (current >= conceptSteps.length - 1) {
          setIsStreaming(false);
          setPhase('practice');
          return current;
        }
        return current + 1;
      });
    }, 1450);
    return () => window.clearInterval(timer);
  }, [conceptSteps.length, isStreaming]);

  useEffect(() => {
    setPhase('explain');
    setActiveStep(0);
    setIsStreaming(false);
  }, [section.id, selectedResource?.id]);

  useEffect(() => {
    if (boardSync) onBoardSync?.(boardSync);
  }, [boardSync, onBoardSync]);

  const startExplanation = () => {
    if (!conceptSteps.length) return;
    setPhase('explain');
    setActiveStep(0);
    setIsStreaming(true);
  };

  const nextExplanationStep = () => {
    if (!conceptSteps.length) return;
    setIsStreaming(false);
    if (activeStep >= conceptSteps.length - 1) {
      setPhase('practice');
      return;
    }
    setActiveStep((current) => current + 1);
  };

  const focusRoadmapStage = (stage: RoadmapStageId) => {
    if (!conceptSteps.length) return;
    setPhase('explain');
    setIsStreaming(false);
    setActiveStep(roadmapIndexForStage(stage, conceptSteps.length));
  };

  return (
    <section className="learning-loop" aria-label="حلقة التعلم التفاعلية" data-testid="interactive-learning-loop">
      <div className="learning-loop-header">
        <div>
          <span className="learning-loop-kicker"><Sparkles size={13} /> محرك التعلّم · سند ← سبورة ← تطبيق</span>
          <h3>افهم الفكرة، شاهدها تُبنى، ثم أثبتها بنفسك</h3>
          <p>{subject} · {lessonTitle} · يطابق المحرك أقرب سند قبل أن يكتب أي خطوة.</p>
        </div>
        <div className="learning-loop-status" data-state={phase}>
          <span className="learning-loop-status-dot" />
          {phase === 'explain' ? 'شرح متدرّج' : 'دورك الآن'}
        </div>
      </div>
      <nav className="learning-roadmap" aria-label="سير عناصر الدرس" data-testid="lesson-roadmap">
        <div className="learning-roadmap-heading">
          <div>
            <span><Target size={13} /> سير عناصر الدرس</span>
            <strong>المسار والسبورة يتحركان معًا</strong>
          </div>
          <small>{currentRoadmapStageIndex + 1} / {roadmapStages.length} · {roadmapStages[currentRoadmapStageIndex]?.shortLabel}</small>
        </div>
        <div className="learning-roadmap-track">
          {roadmapStages.map((stage, index) => {
            const isCurrent = stage.id === currentRoadmapStage;
            const isPast = index < currentRoadmapStageIndex;
            return (
              <div className="learning-roadmap-slot" key={stage.id}>
                <button
                  type="button"
                  className={`learning-roadmap-node ${isCurrent ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`}
                  onClick={() => focusRoadmapStage(stage.id)}
                  disabled={!conceptSteps.length}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`إعادة التركيز على ${stage.label}`}
                  data-testid={`button-roadmap-stage-${stage.id}`}
                >
                  <span className="learning-roadmap-node-index">{index + 1}</span>
                  <span className="learning-roadmap-node-copy"><small>{stage.shortLabel}</small><strong>{stage.label}</strong></span>
                </button>
                {index < roadmapStages.length - 1 && <i className={index < currentRoadmapStageIndex ? 'is-complete' : ''} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
        <p className="learning-roadmap-hint">اضغط على أي عقدة سابقة لإعادة عرضها وتحديدها على السبورة الكبيرة.</p>
      </nav>

       <div className="learning-loop-layout">
         <div className="learning-loop-main">
          <div className="learning-loop-brief" data-phase={phase}>
            <div className="learning-loop-brief-copy">
              <span><Target size={13} /> المسار المختصر · السبورة الرئيسية هي مساحة الشرح</span>
              <strong>{activeBoardStep?.title ?? 'ننتظر السند'}</strong>
               <p><MathText>{activeBoardStep?.detail ?? 'ابدأ الشرح المتدرج لتظهر الفكرة على السبورة الرئيسية.'}</MathText></p>
               {activeBoardStep?.formula && <small><MathText>{activeBoardStep.formula}</MathText></small>}
            </div>
            <div className="learning-loop-brief-actions">
              {phase === 'explain' && (
                <>
                  <button type="button" className="learning-primary-button" onClick={isStreaming ? () => setIsStreaming(false) : startExplanation} disabled={!conceptSteps.length} data-testid="button-start-learning-loop">
                    {isStreaming ? <LoaderCircle size={15} className="learning-spin" /> : <Play size={15} />}
                    {isStreaming ? 'أوقف الشرح' : 'ابدأ الشرح'}
                  </button>
                  <button type="button" className="learning-secondary-button" onClick={nextExplanationStep} disabled={!conceptSteps.length} data-testid="button-next-learning-step">
                    {explanationComplete ? 'افتح التطبيق' : 'الخطوة التالية'} <ChevronLeft size={14} />
                  </button>
                </>
              )}
              {phase === 'practice' && <span className="learning-board-prompt"><Lightbulb size={15} /> انتقل إلى الورقة الشاملة واكتب محاولتك بالقلم.</span>}
            </div>
          </div>

           {phase === 'practice' && (
             <div className="learning-practice-card learning-paper-prompt" data-testid="learning-paper-prompt">
              <div className="learning-practice-header">
                 <div>
                    <span><CircleHelp size={14} /> تثبيت الفهم على الورق</span>
                    <h4>أنجز المحاولة خارج مساحة التصحيح السريع</h4>
                 </div>
                  <span className="learning-practice-badge">ورقة شاملة</span>
              </div>
              <p className="learning-practice-question">
                 <strong>تعليمة الورقة:</strong> {groundedExercise?.title
                   ? `افتح «${groundedExercise.title}»، اكتب جميع الخطوات والتبريرات على الورقة، ثم ارفع صورة المحاولة.`
                   : 'اكتب المعطيات والتحويلات والتبريرات على الورقة، ثم ارفع صورة المحاولة عندما تنتهي.'}
              </p>
               <div className="learning-paper-guard">
                 <ShieldCheck size={15} />
                 <span>لا يظهر التصحيح أو الحل النموذجي أثناء المحاولة. فهيم يراجع الصورة بعد رفعها فقط.</span>
               </div>
            </div>
          )}
        </div>
      </div>
       <div className="learning-loop-footer">
         <span><CheckCircle2 size={13} /> كل شرح ينتهي بمحاولة قصيرة قابلة للتصحيح.</span>
         <span>افهم الفكرة، ثم طبّقها بنفسك.</span>
       </div>
    </section>
  );
}