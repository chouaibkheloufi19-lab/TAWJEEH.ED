import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileText,
  Lightbulb,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import type { KnowledgeCard } from '@workspace/api-client-react';

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
};

type PracticeState = 'idle' | 'correct' | 'retry';
type LoopPhase = 'explain' | 'practice' | 'solution';

type InteractiveLearningLoopProps = {
  lessonTitle: string;
  subject: string;
  section: LoopSection;
  resources: KnowledgeCard[];
  fallbackResource?: KnowledgeCard | null;
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

function buildConceptSteps(section: LoopSection, resource: KnowledgeCard): ConceptStep[] {
  const excerpt = sourceText(resource).slice(0, 220);
  const formula = formulaBySection[section.id] ?? `${section.highlight} ← من السند إلى الفهم`;
  const common = [
    {
      title: 'نقرأ السند',
      detail: `نبدأ من المصدر «${resource.title}» لا من مثال معزول: ${excerpt}`,
      formula: `السند → ${section.highlight}`,
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
      detail: `أغلقنا الشرح على سؤال قصير من موارد المنهاج نفسها: «${resource.title}».`,
      formula: 'افهم → طبّق → تحقّق',
      visual: 'graph' as const,
    },
  ];
  return common;
}

function buildSolutionSteps(section: LoopSection, resource: KnowledgeCard): ConceptStep[] {
  const excerpt = sourceText(resource).slice(0, 240);
  return [
    {
      title: 'المعطى من السند',
      detail: `نعود إلى الاقتباس الأصلي: ${excerpt}`,
      formula: 'المعطيات ← المطلوب',
      visual: 'highlight',
    },
    {
      title: 'المفهوم المناسب',
      detail: `نحدد لماذا ينتمي السؤال إلى «${section.title}»، ثم نعزل الكمية أو الفكرة المطلوبة.`,
      formula: section.highlight,
      visual: 'flow',
    },
    {
      title: 'العلاقة والخطوة',
      detail: `نطبق العلاقة على المعطيات، ونكتب كل انتقال بدل القفز إلى النتيجة.`,
      formula: formulaBySection[section.id] ?? section.highlight,
      visual: 'equation',
    },
    {
      title: 'فحص النتيجة',
      detail: 'نراجع الإشارة والوحدة والمعنى الفيزيائي، ثم نربط النتيجة بجملة من السند.',
      formula: 'نتيجة صحيحة = حساب + تفسير',
      visual: 'graph',
    },
  ];
}

function visualLabel(visual: ConceptStep['visual']): string {
  if (visual === 'equation') return 'علاقة';
  if (visual === 'graph') return 'تحقق';
  if (visual === 'flow') return 'ربط';
  return 'تحديد';
}

export function InteractiveLearningLoop({
  lessonTitle,
  subject,
  section,
  resources,
  fallbackResource,
}: InteractiveLearningLoopProps) {
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [phase, setPhase] = useState<LoopPhase>('explain');
  const [activeStep, setActiveStep] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [solutionStep, setSolutionStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [practiceState, setPracticeState] = useState<PracticeState>('idle');
  const [showHint, setShowHint] = useState(false);

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
    () => selectedResource ? buildConceptSteps(section, selectedResource) : [],
    [section, selectedResource],
  );
  const solutionSteps = useMemo(
    () => selectedResource ? buildSolutionSteps(section, selectedResource) : [],
    [section, selectedResource],
  );
  const practiceResource = useMemo(
    () => matchedResources.find((resource) => resource.type === 'exercise' || resource.type === 'assessment') ?? selectedResource,
    [matchedResources, selectedResource],
  );
  const expectedTerms = useMemo(() => [
    section.highlight,
    section.title,
    formulaBySection[section.id] ?? '',
    ...(practiceResource?.tags ?? []).slice(0, 2),
  ].map(normalizeArabic).filter((term) => term.length >= 3), [practiceResource, section]);
  const practiceExcerpt = practiceResource ? sourceText(practiceResource).slice(0, 260) : '';
  const activeBoardStep = phase === 'solution'
    ? solutionSteps[solutionStep]
    : conceptSteps[activeStep];
  const explanationComplete = phase !== 'explain' || activeStep >= conceptSteps.length - 1;

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
    if (phase !== 'solution' || solutionSteps.length < 2) return;
    const timer = window.setInterval(() => {
      setSolutionStep((current) => Math.min(current + 1, solutionSteps.length - 1));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [phase, solutionSteps.length]);

  useEffect(() => {
    setPhase('explain');
    setActiveStep(0);
    setSolutionStep(0);
    setAnswer('');
    setPracticeState('idle');
    setShowHint(false);
    setIsStreaming(false);
  }, [section.id, selectedResource?.id]);

  const startExplanation = () => {
    if (!conceptSteps.length) return;
    setPhase('explain');
    setActiveStep(0);
    setIsStreaming(true);
    setPracticeState('idle');
    setAnswer('');
    setShowHint(false);
  };

  const submitAnswer = () => {
    const normalized = normalizeArabic(answer);
    const correct = normalized.length >= 3 && expectedTerms.some((term) =>
      normalized.includes(term) || term.includes(normalized),
    );
    setPracticeState(correct ? 'correct' : 'retry');
    if (correct) {
      setSolutionStep(0);
      setPhase('solution');
    }
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

  const resetLoop = () => {
    setPhase('explain');
    setActiveStep(0);
    setSolutionStep(0);
    setIsStreaming(false);
    setAnswer('');
    setPracticeState('idle');
    setShowHint(false);
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
          {phase === 'explain' ? 'شرح متدرّج' : phase === 'practice' ? 'دورك الآن' : 'حلّ مرئي'}
        </div>
      </div>

      <div className="learning-loop-layout">
        <aside className="learning-source-rail" aria-label="المصادر المطابقة">
          <div className="learning-source-heading">
            <span><BookOpen size={14} /> مطابقة السندات</span>
            <strong>{matchedResources.length}</strong>
          </div>
          <p className="learning-source-intro">مصادر حقيقية من قاعدة المنهاج، مرتبة حسب قربها من «{section.title}».</p>
          <div className="learning-source-list">
            {matchedResources.slice(0, 5).map((resource, index) => (
              <button
                type="button"
                key={resource.id}
                className={`learning-source-card ${resource.id === selectedResource?.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedResourceId(resource.id)}
                data-testid={`button-learning-source-${index + 1}`}
              >
                <span className="learning-source-card-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="learning-source-card-copy">
                  <strong>{resource.title}</strong>
                  <small>{resource.type === 'exercise' || resource.type === 'assessment' ? 'تمرين مباشر' : 'سند شرح'} · ص {resource.page}</small>
                </span>
                <ChevronLeft size={13} />
              </button>
            ))}
            {!matchedResources.length && (
              <div className="learning-source-empty"><FileText size={16} /><span>لم يصل سند بعد. أعد المحاولة بعد اكتمال خدمة المعرفة.</span></div>
            )}
          </div>
          {selectedResource && (
            <div className="learning-source-quote">
              <span><FileText size={12} /> الاقتباس الذي سيقود الشرح</span>
              <p>«{sourceText(selectedResource).slice(0, 190)}»</p>
              <small>{selectedResource.source} · الصفحة {selectedResource.page}</small>
            </div>
          )}
        </aside>

        <div className="learning-loop-main">
          <div className="learning-board-engine" data-phase={phase}>
            <div className="learning-board-engine-top">
              <div>
                <span><Target size={13} /> السبورة التفاعلية · {section.label}</span>
                <strong>{phase === 'solution' ? 'الحل يُرسم خطوة خطوة' : activeBoardStep?.title ?? 'ننتظر السند'}</strong>
              </div>
              <div className="learning-board-step-count">
                {phase === 'solution'
                  ? `${solutionStep + 1} / ${solutionSteps.length}`
                  : `${Math.min(activeStep + 1, conceptSteps.length)} / ${conceptSteps.length}`}
              </div>
            </div>
            <div className="learning-board-canvas" aria-live="polite">
              <div className="learning-board-grid" />
              <div className={`learning-board-visual is-${activeBoardStep?.visual ?? 'flow'}`}>
                <span className="learning-board-visual-label">{visualLabel(activeBoardStep?.visual ?? 'flow')}</span>
                <div className="learning-board-visual-content">
                  {activeBoardStep?.visual === 'graph' ? (
                    <svg viewBox="0 0 330 130" role="img" aria-label="مخطط العلاقة">
                      <path d="M35 105H300M35 105V20M48 91C95 82 126 74 158 57S234 37 290 24" />
                      <circle cx="158" cy="57" r="5" />
                      <text x="270" y="121">الزمن</text>
                      <text x="7" y="25">الأثر</text>
                    </svg>
                  ) : activeBoardStep?.visual === 'equation' ? (
                    <div className="learning-board-equation">{activeBoardStep.formula}</div>
                  ) : activeBoardStep?.visual === 'highlight' ? (
                    <div className="learning-board-highlight"><span>{section.highlight}</span><i /></div>
                  ) : (
                    <div className="learning-board-flow"><b>المعطى</b><i>←</i><b>المفهوم</b><i>←</i><b>النتيجة</b></div>
                  )}
                </div>
              </div>
              <div className="learning-board-note">
                <span>{activeBoardStep?.title ?? 'لا يوجد مصدر محدد'}</span>
                <p>{activeBoardStep?.detail ?? 'اختر سندًا من القائمة لبدء المحرك.'}</p>
                {activeBoardStep?.formula && <strong>{activeBoardStep.formula}</strong>}
              </div>
            </div>
            <div className="learning-board-controls">
              {phase === 'explain' && (
                <>
                  <button type="button" className="learning-primary-button" onClick={isStreaming ? () => setIsStreaming(false) : startExplanation} disabled={!conceptSteps.length} data-testid="button-start-learning-loop">
                    {isStreaming ? <LoaderCircle size={15} className="learning-spin" /> : <Play size={15} />}
                    {isStreaming ? 'أوقف التدفق' : 'ابدأ الشرح المتدرج'}
                  </button>
                  <button type="button" className="learning-secondary-button" onClick={nextExplanationStep} disabled={!conceptSteps.length} data-testid="button-next-learning-step">
                    {explanationComplete ? 'افتح التطبيق' : 'الخطوة التالية'} <ChevronLeft size={14} />
                  </button>
                </>
              )}
              {phase === 'practice' && (
                <span className="learning-board-prompt"><Lightbulb size={15} /> اكتب إجابتك في البطاقة التالية؛ ستعود الخطوات إلى السبورة عند النجاح.</span>
              )}
              {phase === 'solution' && (
                <>
                  <button type="button" className="learning-secondary-button" onClick={() => setSolutionStep((current) => Math.min(current + 1, solutionSteps.length - 1))} disabled={solutionStep >= solutionSteps.length - 1} data-testid="button-next-solution-step">
                    الخطوة التالية <ChevronLeft size={14} />
                  </button>
                  <button type="button" className="learning-ghost-button" onClick={resetLoop}><RotateCcw size={14} /> أعد الحلقة</button>
                </>
              )}
            </div>
          </div>

          {phase === 'practice' && (
            <div className="learning-practice-card" data-testid="learning-micro-practice">
              <div className="learning-practice-header">
                <div>
                  <span><CircleHelp size={14} /> حلقة التطبيق القصير</span>
                  <h4>من السند «{practiceResource?.title ?? 'المصدر المحدد'}»</h4>
                </div>
                <span className="learning-practice-badge">مباشر من المنهاج</span>
              </div>
              <div className="learning-practice-source">
                <FileText size={14} />
                <p>{practiceExcerpt || 'لم يصل نص المصدر بعد.'}</p>
              </div>
              <p className="learning-practice-question">
                <strong>سؤال التثبيت:</strong> ما الفكرة أو العلاقة التي تفسّر هذا المقطع؟ اكتبها بكلماتك، واذكر العلاقة إن ظهرت في الدرس.
              </p>
              <form onSubmit={(event) => { event.preventDefault(); submitAnswer(); }} className="learning-practice-form">
                <input
                  value={answer}
                  onChange={(event) => { setAnswer(event.target.value); setPracticeState('idle'); }}
                  placeholder={`اكتب مثلًا: ${section.highlight}`}
                  aria-label="إجابة تمرين التثبيت"
                  data-testid="input-learning-answer"
                />
                <button type="submit" className="learning-primary-button" disabled={!answer.trim()} data-testid="button-check-learning-answer">
                  <Check size={15} /> صحّح إجابتي
                </button>
              </form>
              {practiceState === 'retry' && (
                <div className="learning-feedback is-retry" role="alert">
                  <CircleHelp size={15} /><span>اقتربت. ابدأ من الكلمة المظللة «{section.highlight}»، ثم اربطها بالمقطع قبل إعادة الإرسال.</span>
                  <button type="button" onClick={() => setShowHint((shown) => !shown)}>{showHint ? 'إخفاء التلميح' : 'أظهر التلميح'}</button>
                </div>
              )}
              {practiceState === 'correct' && (
                <div className="learning-feedback is-correct" role="status"><CheckCircle2 size={16} /><span>إجابة موفقة. انتقلنا تلقائيًا إلى الحل المرئي على السبورة.</span></div>
              )}
              {showHint && practiceState === 'retry' && (
                <div className="learning-hint"><Lightbulb size={14} /> تلميح: ابحث في السند عن «{section.highlight}» أو العلاقة «{formulaBySection[section.id]}».</div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="learning-loop-footer">
        <span><CheckCircle2 size={13} /> لا يكتفي بالعرض: كل شرح ينتهي بمحاولة قابلة للتصحيح.</span>
        <span>المصدر المختار: {selectedResource?.source ?? 'بانتظار قاعدة المعرفة'}</span>
      </div>
    </section>
  );
}