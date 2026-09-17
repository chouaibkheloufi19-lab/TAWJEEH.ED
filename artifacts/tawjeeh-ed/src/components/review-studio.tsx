import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  ImagePlus,
  Info,
  RefreshCw,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { fetchWithTimeout } from '@/lib/request';
import { MathText } from '@/components/math-text';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';
import { PaperAttemptCopilot, type PaperAttemptAnalysis } from '@/components/paper-attempt-copilot';
import './review-studio.css';

export type ExplanationSection = {
  title: string;
  content: string;
  key_points: string[];
  example?: string;
};

export type ExplanationResult = {
  lesson_title: string;
  explanation_sections: ExplanationSection[];
  key_points: string[];
  examples: string[];
  grounding: Grounding;
};

export type ExerciseType = 'mcq' | 'true_false' | 'practical';

export type ExerciseSection = {
  id: string;
  title: string;
  points: number;
  prompt: string;
};

export type ExercisesResult = {
  lesson_title: string;
  title: string;
  prompt: string;
  hint: string;
  format: 'comprehensive_function' | 'comprehensive_science';
  total_points: number;
  sections: ExerciseSection[];
  grounding: Grounding;
};

type GroundingSource = {
  nodeId: string;
  title: string;
  source: string;
  page: number;
  quote: string;
};

type Grounding = {
  status: string;
  query: string;
  retrievedNodeIds: string[];
  sources: GroundingSource[];
};

type GenerationKind = 'explanation' | 'exercises';
type GenerationState = 'idle' | 'loading' | 'ready' | 'error';
type AttemptState = 'idle' | 'analyzing' | 'ready' | 'error';

type ApiErrorPayload = {
  error?: string;
  message?: string;
  retryable?: boolean;
};

const levels = [
  { value: 'التعليم المتوسط', label: 'التعليم المتوسط' },
  { value: 'التعليم الثانوي', label: 'التعليم الثانوي' },
  { value: 'التعليم الجامعي التمهيدي', label: 'الجامعي التمهيدي' },
] as const;

function getErrorMessage(error: unknown, kind: GenerationKind) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'استغرق الطلب وقتًا أطول من المتوقع. تحقّق من الاتصال ثم أعد المحاولة.';
  }
  if (error instanceof Error && error.message && !/failed to fetch|network error/i.test(error.message)) {
    return error.message;
  }
  return kind === 'explanation'
    ? 'تعذر توليد الشرح حاليًا. أعد المحاولة بعد قليل.'
    : 'تعذر توليد التمارين حاليًا. أعد المحاولة بعد قليل.';
}

async function postAi<T>(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null) as T | ApiErrorPayload | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
      ? body.message
      : 'تعذر إكمال الطلب. أعد المحاولة بعد قليل.';
    throw new Error(message);
  }
  if (!body) throw new Error('لم تصل نتيجة صالحة من الخادم.');
  return body as T;
}

function isExerciseType(value: string): value is ExerciseType {
  return value === 'mcq' || value === 'true_false' || value === 'practical';
}

export function ReviewStudio() {
  const [lessonTitle, setLessonTitle] = useState('');
  const [content, setContent] = useState('');
  const [level, setLevel] = useState<string>('التعليم الثانوي');
  const [explanation, setExplanation] = useState<ExplanationResult | null>(null);
  const [exercises, setExercises] = useState<ExercisesResult | null>(null);
  const [explanationState, setExplanationState] = useState<GenerationState>('idle');
  const [exercisesState, setExercisesState] = useState<GenerationState>('idle');
  const [explanationError, setExplanationError] = useState('');
  const [exercisesError, setExercisesError] = useState('');
  const [formError, setFormError] = useState('');
  const [attemptImage, setAttemptImage] = useState<string | null>(null);
  const [attemptName, setAttemptName] = useState('');
  const [attemptState, setAttemptState] = useState<AttemptState>('idle');
  const [attemptAnalysis, setAttemptAnalysis] = useState<PaperAttemptAnalysis | null>(null);
  const [attemptError, setAttemptError] = useState('');
  const [attemptStartedAt, setAttemptStartedAt] = useState<number | null>(null);
  const [attemptElapsed, setAttemptElapsed] = useState(0);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [copilotAnswer, setCopilotAnswer] = useState('');
  const [copilotError, setCopilotError] = useState('');
  const [copilotState, setCopilotState] = useState<'idle' | 'asking' | 'error'>('idle');

  const hasInput = Boolean(lessonTitle.trim() && content.trim());
  const canGenerateExercises = hasInput;
  const selectedLevelLabel = useMemo(
    () => levels.find((item) => item.value === level)?.label ?? level,
    [level],
  );

  const validate = useCallback((kind: GenerationKind) => {
    if (!lessonTitle.trim() || !content.trim()) {
      setFormError('أدخل عنوان الدرس ومحتواه أولًا.');
      return false;
    }
    if (kind === 'exercises' && !exerciseTypes.length) {
      setFormError('اختر نوعًا واحدًا على الأقل من التمارين.');
      return false;
    }
    setFormError('');
    return true;
  }, [content, exerciseTypes.length, lessonTitle]);

  const generateExplanation = useCallback(async () => {
    if (!validate('explanation')) return;
    setExplanationState('loading');
    setExplanationError('');
    try {
      const result = await postAi<ExplanationResult>('/api/ai/generate-explanation', {
        lesson_title: lessonTitle.trim(),
        content: content.trim(),
        level,
      });
      setExplanation(result);
      setExplanationState('ready');
    } catch (error) {
      setExplanationState('error');
      setExplanationError(getErrorMessage(error, 'explanation'));
    }
  }, [content, lessonTitle, level, validate]);

  const generateExercises = useCallback(async () => {
    if (!validate('exercises')) return;
    setExercisesState('loading');
    setExercisesError('');
    setAttemptImage(null);
    setAttemptName('');
    setAttemptAnalysis(null);
    setAttemptState('idle');
    setAttemptError('');
    setAttemptElapsed(0);
    try {
      const result = await postAi<ExercisesResult>('/api/ai/generate-exercises', {
        lesson_title: lessonTitle.trim(),
        content: content.trim(),
        level,
        exercise_count: 1,
        exercise_types: ['practical'],
      });
      setExercises(result);
      setExercisesState('ready');
      setAttemptStartedAt(Date.now());
    } catch (error) {
      setExercisesState('error');
      setExercisesError(getErrorMessage(error, 'exercises'));
    }
  }, [content, lessonTitle, level, validate]);

  useEffect(() => {
    if (!attemptStartedAt || attemptState === 'ready' || attemptState === 'error') return undefined;
    const updateElapsed = () => setAttemptElapsed(Math.max(0, Math.floor((Date.now() - attemptStartedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [attemptStartedAt, attemptState]);

  const formatAttemptElapsed = (seconds: number) => (
    `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  );

  const analyzePaperAttempt = async (imageDataUrl: string, fileName: string) => {
    if (!exercises) return;
    const elapsed = attemptStartedAt
      ? Math.max(0, Math.floor((Date.now() - attemptStartedAt) / 1000))
      : attemptElapsed;
    setAttemptElapsed(elapsed);
    setAttemptState('analyzing');
    setAttemptError('');
    try {
      const response = await fetchWithTimeout('/api/fahim/analyze-attempt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          lesson: exercises.lesson_title,
          concept: [
            exercises.title,
            exercises.prompt,
            `زمن المحاولة: ${formatAttemptElapsed(elapsed)}`,
            exercises.sections.map((section) => `${section.title}: ${section.prompt}`).join(' | '),
          ].join('\n'),
          elapsed_seconds: elapsed,
        }),
      });
      const payload = await response.json() as Partial<PaperAttemptAnalysis> & { message?: string };
      if (!response.ok || !payload.firstErrorStep || !payload.lastCorrectStep || !payload.feedback) {
        throw new Error(payload.message || 'تعذر تحليل صورة المحاولة.');
      }
      setAttemptAnalysis({
        firstErrorStep: payload.firstErrorStep,
        lastCorrectStep: payload.lastCorrectStep,
        feedback: payload.feedback,
      });
      setAttemptState('ready');
      setCopilotAnswer(`حللت محاولتك بعد ${formatAttemptElapsed(elapsed)}. اسألني عن الخطوة التي تريد مراجعتها، ولن أعرض الحل قبل أن تطلبه.`);
      setCopilotError('');
      setCopilotState('idle');
      setCopilotOpen(true);
    } catch (error) {
      setAttemptState('error');
      setAttemptError(error instanceof Error ? error.message : 'تعذر تحليل صورة المحاولة.');
    }
    setAttemptName(fileName);
  };

  const handleAttemptUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !exercises) return;
    setAttemptError('');
    if (!file.type.startsWith('image/')) {
      setAttemptState('error');
      setAttemptError('ارفع صورة واضحة لورقة الحل.');
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      setAttemptState('error');
      setAttemptError('حجم الصورة يجب أن يكون أقل من 7 ميغابايت.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setAttemptImage(reader.result);
      setAttemptName(file.name);
      void analyzePaperAttempt(reader.result, file.name);
    };
    reader.readAsDataURL(file);
  };

  const downloadPaper = () => {
    if (!exercises) return;
    const content = [
      exercises.title,
      `المادة: ${exercises.lesson_title}`,
      `العلامة: ${exercises.total_points} نقطة`,
      '',
      'أجب على الورقة بالقلم، ثم ارفع صورة المحاولة إلى فهيم للتصحيح.',
      '',
      exercises.prompt,
      '',
      exercises.sections.map((section, index) => (
        `${index + 1}. ${section.title} (${section.points} نقاط)\n${section.prompt}`
      )).join('\n\n'),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${exercises.title.replace(/[^\p{L}\p{N}\s-]/gu, '').trim() || 'ورقة-دراسة-شاملة'}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const askPaperCopilot = async () => {
    if (!exercises || !attemptAnalysis || !copilotQuestion.trim() || copilotState === 'asking') return;
    const question = copilotQuestion.trim();
    setCopilotState('asking');
    setCopilotError('');
    try {
      const response = await fetchWithTimeout('/api/fahim/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question,
          lesson: exercises.lesson_title,
          concept: exercises.title,
          context: [
            'هذه محاولة ورقية مرفوعة من الطالب بعد حل ورقة شاملة.',
            `زمن المحاولة: ${formatAttemptElapsed(attemptElapsed)}`,
            `المطلوبات: ${exercises.sections.map((section) => `${section.title}: ${section.prompt}`).join(' | ')}`,
            `آخر خطوة صحيحة: ${attemptAnalysis.lastCorrectStep}`,
            `أول موضع يحتاج مراجعة: ${attemptAnalysis.firstErrorStep}`,
            `تحليل فهيم: ${attemptAnalysis.feedback}`,
            'أجب داخل الكوبيلوت بأسلوب تفاعلي: اسأل الطالب عن خطوته التالية أو اطلب منه تفسيرًا قصيرًا، ثم قدّم تلميحًا متدرجًا. لا تعرض الحل النموذجي كاملًا إلا إذا طلبه الطالب صراحة داخل الكوبيلوت، وعندها اعرضه خطوة خطوة لا دفعة واحدة. لا تذكر المصادر أو المقاطع للطالب.',
          ].join('\n'),
        }),
      });
      const payload = await response.json() as { answer?: string; chat_response?: string; message?: string };
      const answer = payload.answer || payload.chat_response;
      if (!response.ok || !answer) throw new Error(payload.message || 'تعذر رد فهيم على المحاولة.');
      setCopilotAnswer(answer);
      setCopilotQuestion('');
      setCopilotState('idle');
    } catch (error) {
      setCopilotState('error');
      setCopilotError(error instanceof Error ? error.message : 'تعذر رد فهيم الآن.');
    }
  };

  const resetStudio = () => {
    setLessonTitle('');
    setContent('');
    setLevel('التعليم الثانوي');
    setExplanation(null);
    setExercises(null);
    setExplanationState('idle');
    setExercisesState('idle');
    setExplanationError('');
    setExercisesError('');
    setFormError('');
    setAttemptImage(null);
    setAttemptName('');
    setAttemptState('idle');
    setAttemptAnalysis(null);
    setAttemptError('');
    setAttemptStartedAt(null);
    setAttemptElapsed(0);
    setCopilotOpen(false);
    setCopilotQuestion('');
    setCopilotAnswer('');
    setCopilotError('');
    setCopilotState('idle');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void generateExplanation();
  };

  return (
    <main className="review-studio" dir="rtl" data-testid="review-studio">
      <div className="review-studio-shell">
        <header className="review-studio-hero fade-up">
          <div>
            <div className="review-studio-kicker">
              <Sparkles size={14} aria-hidden="true" />
              <span>مساحة المراجعة</span>
            </div>
            <h1>حوّل درسك إلى جلسة مراجعة واضحة.</h1>
            <p>
              ألصق محتوى الدرس كما هو، ودع الاستوديو يرتّبه إلى شرح مفهوم وتمارين
              قريبة من مستوى تعلّمك — دون إضافة مراجع من خارج النص.
            </p>
          </div>
          <div className="review-studio-hero-note" aria-label="طريقة عمل الاستوديو">
            <div>
              <BookOpenText size={17} aria-hidden="true" />
              <div>
                <strong>ابدأ بفكرة أو سؤال</strong>
                <span>سنرتّب ما تكتبه في شرح واضح وتمارين مناسبة لمستواك.</span>
                <span>نستعين بمصادر دراسية موثوقة حتى تكون المراجعة أدق.</span>
              </div>
            </div>
            <div>
              <ListChecks size={17} aria-hidden="true" />
              <div>
                <strong>نتيجة منظمة للمراجعة</strong>
                <span>شرح، نقاط أساسية، ثم تمارين مشابهة قابلة للتدريب.</span>
              </div>
            </div>
          </div>
        </header>

        <div className="review-studio-grid">
          <form className="review-studio-card review-studio-input-card fade-up" onSubmit={handleSubmit}>
            <div className="review-studio-card-heading">
              <div>
                <h2>مادة الدرس</h2>
                <p>املأ الحقول ثم اختر المخرج الذي تريد البدء به.</p>
              </div>
              <span className="review-studio-mark" aria-hidden="true">
                <FileText size={19} />
              </span>
            </div>

            {formError && (
              <div className="review-studio-alert" role="alert" data-testid="review-studio-form-error">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="review-studio-field">
              <label htmlFor="review-studio-title">عنوان الدرس</label>
              <input
                id="review-studio-title"
                data-testid="review-studio-title"
                value={lessonTitle}
                onChange={(event) => {
                  setLessonTitle(event.target.value);
                  setFormError('');
                }}
                placeholder="مثال: تركيب الخلية ووظائفها"
                maxLength={180}
              />
            </div>

            <div className="review-studio-field">
              <label htmlFor="review-studio-content">محتوى الدرس</label>
              <textarea
                id="review-studio-content"
                data-testid="review-studio-content"
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setFormError('');
                }}
                placeholder="ألصق هنا الفقرة أو الملاحظات أو ملخص الدرس..."
                maxLength={50000}
              />
              <span className="review-studio-helper">
                {content.length.toLocaleString('ar-DZ')} / ٥٠٬٠٠٠ حرف
              </span>
            </div>

            <div className="review-studio-control-row">
              <div className="review-studio-field">
                <label htmlFor="review-studio-level">مستوى التعلّم</label>
                <select
                  id="review-studio-level"
                  data-testid="review-studio-level"
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                >
                  {levels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <fieldset className="review-studio-fieldset">
                <legend>عدد التمارين</legend>
                <div className="review-studio-count">
                  <button
                    type="button"
                    aria-label="تقليل عدد التمارين"
                    data-testid="review-studio-decrease-count"
                    onClick={() => changeExerciseCount(-1)}
                    disabled={exerciseCount <= 1}
                  >
                    <Minus size={14} aria-hidden="true" />
                  </button>
                  <input
                    aria-label="عدد التمارين"
                    data-testid="review-studio-exercise-count"
                    type="number"
                    min={1}
                    max={10}
                    value={exerciseCount}
                    onChange={(event) => setExerciseCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
                  />
                  <button
                    type="button"
                    aria-label="زيادة عدد التمارين"
                    data-testid="review-studio-increase-count"
                    onClick={() => changeExerciseCount(1)}
                    disabled={exerciseCount >= 10}
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </div>
              </fieldset>
            </div>

            <fieldset className="review-studio-fieldset">
              <legend>أنواع التمارين</legend>
              <div className="review-studio-type-options">
                {defaultExerciseTypes.map((type) => (
                  <label className="review-studio-type-option" key={type}>
                    <input
                      type="checkbox"
                      checked={exerciseTypes.includes(type)}
                      data-testid={`review-studio-type-${type}`}
                      onChange={() => toggleExerciseType(type)}
                    />
                    <span>{exerciseTypeLabels[type]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="review-studio-actions">
              <button
                type="submit"
                className="review-studio-primary-action"
                data-testid="review-studio-generate-explanation"
                disabled={!hasInput || explanationState === 'loading'}
              >
                {explanationState === 'loading' ? (
                  <span className="review-studio-loading"><RefreshCw size={16} aria-hidden="true" /> جارٍ بناء الشرح...</span>
                ) : (
                  <><WandSparkles size={16} aria-hidden="true" /> توليد شرح الدرس</>
                )}
              </button>
              <button
                type="button"
                className="review-studio-secondary-action"
                data-testid="review-studio-generate-exercises"
                onClick={() => void generateExercises()}
                disabled={!canGenerateExercises || exercisesState === 'loading'}
              >
                {exercisesState === 'loading' ? (
                  <span className="review-studio-loading"><RefreshCw size={16} aria-hidden="true" /> جارٍ إعداد التمارين...</span>
                ) : (
                  <><ListChecks size={16} aria-hidden="true" /> توليد تمارين مشابهة</>
                )}
              </button>
              <button
                type="button"
                className="review-studio-secondary-action"
                data-testid="review-studio-reset"
                onClick={resetStudio}
              >
                بدء مراجعة جديدة
              </button>
            </div>

            <div className="review-studio-source" data-testid="review-studio-source-attribution">
              <Info size={15} aria-hidden="true" />
              <p>
                 نبدأ من فكرتك، ثم نربطها بمصادر دراسية موثوقة لنقدّم لك مراجعة واضحة.
              </p>
            </div>
          </form>

          <section className="review-studio-results" aria-label="نتائج المراجعة">
            <article
              className="review-studio-card review-studio-output-card fade-up"
              aria-busy={explanationState === 'loading'}
              data-testid="review-studio-explanation-panel"
            >
              <div className="review-studio-output-heading">
                <div>
                  <h2>الشرح المنظم</h2>
                  <p>{explanation?.lesson_title ?? `المستوى: ${selectedLevelLabel}`}</p>
                </div>
                <span className="review-studio-output-badge">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  <span>{explanation ? 'جاهز للمراجعة' : 'بانتظار المحتوى'}</span>
                </span>
              </div>
              <div className="review-studio-output-body" aria-live="polite">
                {explanationState === 'loading' && (
                  <div className="review-studio-skeleton" aria-label="جارٍ توليد الشرح" data-testid="review-studio-explanation-loading">
                    <span className="review-studio-skeleton-line" />
                    <span className="review-studio-skeleton-line" />
                    <span className="review-studio-skeleton-line" />
                    <span className="review-studio-skeleton-line" />
                  </div>
                )}
                {explanationState === 'error' && (
                  <div className="review-studio-alert" role="alert" data-testid="review-studio-explanation-error">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{explanationError}</span>
                  </div>
                )}
                {explanationState === 'idle' && !explanation && (
                  <div className="review-studio-empty" data-testid="review-studio-explanation-empty">
                    <BookOpenText size={25} aria-hidden="true" />
                    <strong>سيظهر الشرح هنا</strong>
                    <span>اكتب محتوى الدرس ثم اضغط «توليد شرح الدرس» لترتيبه إلى مقاطع قصيرة.</span>
                  </div>
                )}
                {explanation && explanationState === 'ready' && (
                  <div data-testid="review-studio-explanation-result">
                    {explanation.explanation_sections.map((section, index) => (
                      <section className="review-studio-section" key={`${section.title}-${index}`}>
                        <h3><MathText>{section.title}</MathText></h3>
                        <p><MathText>{section.content}</MathText></p>
                        {section.key_points.length > 0 && (
                          <ul className="review-studio-points">
                             {section.key_points.map((point) => <li key={point}><MathText>{point}</MathText></li>)}
                          </ul>
                        )}
                         {section.example && <div className="review-studio-example">مثال: <MathText>{section.example}</MathText></div>}
                      </section>
                    ))}
                    {explanation.key_points.length > 0 && (
                      <div className="review-studio-keypoints">
                        {explanation.key_points.map((point, index) => (
                          <div className="review-studio-keypoint" key={point} data-testid={`review-studio-keypoint-${index}`}>
                            <strong>نقطة أساسية {index + 1}</strong>
                             <MathText>{point}</MathText>
                          </div>
                        ))}
                      </div>
                    )}
                    <GroundingSources grounding={explanation.grounding} />
                  </div>
                )}
              </div>
            </article>

            <article
              className="review-studio-card review-studio-output-card fade-up"
              aria-busy={exercisesState === 'loading'}
              data-testid="review-studio-exercises-panel"
            >
              <div className="review-studio-output-heading">
                <div>
                  <h2>تمارين مشابهة</h2>
                  <p>{exercises?.lesson_title ?? 'تدريب مبني على محتوى الدرس نفسه'}</p>
                </div>
                <span className="review-studio-output-badge">
                  <ListChecks size={13} aria-hidden="true" />
                  <span>{exercises ? `${exercises.exercises.length} تمارين` : 'لم تُنشأ بعد'}</span>
                </span>
              </div>
              <div className="review-studio-output-body" aria-live="polite">
                {exercisesState === 'loading' && (
                  <div className="review-studio-skeleton" aria-label="جارٍ توليد التمارين" data-testid="review-studio-exercises-loading">
                    <span className="review-studio-skeleton-line" />
                    <span className="review-studio-skeleton-line" />
                    <span className="review-studio-skeleton-line" />
                    <span className="review-studio-skeleton-line" />
                  </div>
                )}
                {exercisesState === 'error' && (
                  <div className="review-studio-alert" role="alert" data-testid="review-studio-exercises-error">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{exercisesError}</span>
                  </div>
                )}
                {exercisesState === 'idle' && !exercises && (
                  <div className="review-studio-empty" data-testid="review-studio-exercises-empty">
                    <ListChecks size={25} aria-hidden="true" />
                    <strong>تمارينك ستظهر هنا</strong>
                    <span>حدد الأنواع التي تريدها، ثم اطلب تمارين مشابهة للتدرّب على الفكرة.</span>
                  </div>
                )}
                {exercises && exercisesState === 'ready' && (
                  <div className="review-studio-exercises" data-testid="review-studio-exercises-result">
                    {exercises.exercises.map((exercise, index) => (
                      <article className="review-studio-exercise" key={exercise.id} data-testid={`review-studio-exercise-${exercise.id}`}>
                        <div className="review-studio-exercise-top">
                          <span className="review-studio-exercise-number">تمرين {index + 1}</span>
                          <span className="review-studio-exercise-type">{exerciseTypeLabels[exercise.type]}</span>
                        </div>
                         <h3><MathText>{exercise.question}</MathText></h3>
                        {exercise.options.length > 0 && (
                          <ul className="review-studio-options">
                           {exercise.options.map((option) => <li key={option}><MathText>{option}</MathText></li>)}
                          </ul>
                        )}
                        <div className="review-studio-answer">
                          <strong>الإجابة النموذجية: </strong>
                           <MathText>{exercise.model_answer}</MathText>
                          <br />
                          <strong>لماذا؟ </strong>
                           <MathText>{exercise.explanation}</MathText>
                        </div>
                      </article>
                    ))}
                    <GroundingSources grounding={exercises.grounding} />
                  </div>
                )}
              </div>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}

function GroundingSources({ grounding }: { grounding?: Grounding }) {
  if (!grounding?.sources?.length) return null;
  return (
    <aside className="review-studio-grounding" aria-label="المراجع المستخدمة">
      <div className="review-studio-grounding-heading">
        <BookOpenText size={15} aria-hidden="true" />
        <strong>مراجع من مكتبة Tawjeeh</strong>
        <span>{grounding.sources.length} مقاطع</span>
      </div>
      <ul>
        {grounding.sources.slice(0, 5).map((source) => (
          <li key={source.nodeId}>
            <span>{source.source}</span>
            {source.page > 0 && <small>ص {source.page}</small>}
             {source.quote && <p><MathText>{source.quote}</MathText></p>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default ReviewStudio;