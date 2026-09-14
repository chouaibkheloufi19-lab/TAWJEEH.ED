import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  FileText,
  Info,
  ListChecks,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { fetchWithTimeout } from '@/lib/request';
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

export type Exercise = {
  id: string;
  type: ExerciseType;
  question: string;
  options: string[];
  correct_answer: string;
  model_answer: string;
  explanation: string;
};

export type ExercisesResult = {
  lesson_title: string;
  exercises: Exercise[];
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

const exerciseTypeLabels: Record<ExerciseType, string> = {
  mcq: 'اختيار من متعدد',
  true_false: 'صح أو خطأ',
  practical: 'تطبيق عملي',
};

const defaultExerciseTypes: ExerciseType[] = ['mcq', 'true_false', 'practical'];

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
  const [exerciseCount, setExerciseCount] = useState(6);
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseType[]>(defaultExerciseTypes);
  const [explanation, setExplanation] = useState<ExplanationResult | null>(null);
  const [exercises, setExercises] = useState<ExercisesResult | null>(null);
  const [explanationState, setExplanationState] = useState<GenerationState>('idle');
  const [exercisesState, setExercisesState] = useState<GenerationState>('idle');
  const [explanationError, setExplanationError] = useState('');
  const [exercisesError, setExercisesError] = useState('');
  const [formError, setFormError] = useState('');

  const hasInput = Boolean(lessonTitle.trim() && content.trim());
  const canGenerateExercises = hasInput && exerciseTypes.length > 0;
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
    try {
      const result = await postAi<ExercisesResult>('/api/ai/generate-exercises', {
        lesson_title: lessonTitle.trim(),
        content: content.trim(),
        level,
        exercise_count: exerciseCount,
        exercise_types: exerciseTypes,
      });
      setExercises(result);
      setExercisesState('ready');
    } catch (error) {
      setExercisesState('error');
      setExercisesError(getErrorMessage(error, 'exercises'));
    }
  }, [content, exerciseCount, exerciseTypes, lessonTitle, level, validate]);

  const resetStudio = () => {
    setLessonTitle('');
    setContent('');
    setLevel('التعليم الثانوي');
    setExerciseCount(6);
    setExerciseTypes(defaultExerciseTypes);
    setExplanation(null);
    setExercises(null);
    setExplanationState('idle');
    setExercisesState('idle');
    setExplanationError('');
    setExercisesError('');
    setFormError('');
  };

  const toggleExerciseType = (type: ExerciseType) => {
    setExerciseTypes((current) => current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type]);
    setFormError('');
  };

  const changeExerciseCount = (amount: number) => {
    setExerciseCount((current) => Math.max(1, Math.min(10, current + amount)));
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
                        <h3>{section.title}</h3>
                        <p>{section.content}</p>
                        {section.key_points.length > 0 && (
                          <ul className="review-studio-points">
                            {section.key_points.map((point) => <li key={point}>{point}</li>)}
                          </ul>
                        )}
                        {section.example && <div className="review-studio-example">مثال: {section.example}</div>}
                      </section>
                    ))}
                    {explanation.key_points.length > 0 && (
                      <div className="review-studio-keypoints">
                        {explanation.key_points.map((point, index) => (
                          <div className="review-studio-keypoint" key={point} data-testid={`review-studio-keypoint-${index}`}>
                            <strong>نقطة أساسية {index + 1}</strong>
                            {point}
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
                        <h3>{exercise.question}</h3>
                        {exercise.options.length > 0 && (
                          <ul className="review-studio-options">
                            {exercise.options.map((option) => <li key={option}>{option}</li>)}
                          </ul>
                        )}
                        <div className="review-studio-answer">
                          <strong>الإجابة النموذجية: </strong>
                          {exercise.model_answer}
                          <br />
                          <strong>لماذا؟ </strong>
                          {exercise.explanation}
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
            {source.quote && <p>{source.quote}</p>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default ReviewStudio;