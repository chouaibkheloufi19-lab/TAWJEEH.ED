import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Download,
  FileImage,
  FileText,
  ListChecks,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { fetchWithTimeout } from '@/lib/request';
import { MathText } from '@/components/math-text';
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
};

export type ExerciseSection = {
  id: string;
  title: string;
  points: number;
  prompt: string;
};

/**
 * Deliberately mirrors the public exercise contract. The server may keep
 * solution/grounding fields internally, but they are not part of the student
 * state and cannot accidentally leak into the worksheet UI.
 */
export type ComprehensivePaper = {
  status: 'generated';
  mode: 'paper';
  lessonTitle: string;
  title: string;
  prompt: string;
  difficulty: 'advanced';
  format: 'comprehensive_function' | 'comprehensive_science';
  totalPoints: number;
  sections: ExerciseSection[];
};

type GenerationState = 'idle' | 'loading' | 'ready' | 'error';
type AttemptState = 'idle' | 'analyzing' | 'ready' | 'error';
type ApiErrorPayload = { message?: string; error?: string };
const GENERATION_REQUEST_TIMEOUT_MS = 60_000;

const levels = [
  { value: 'التعليم المتوسط', label: 'التعليم المتوسط' },
  { value: 'التعليم الثانوي', label: 'التعليم الثانوي' },
  { value: 'التعليم الجامعي التمهيدي', label: 'الجامعي التمهيدي' },
] as const;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'استغرق الطلب وقتًا أطول من المتوقع. تحقّق من الاتصال ثم أعد المحاولة.';
  }
  if (error instanceof Error && error.message && !/failed to fetch|network error/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}

async function postJson<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  }, GENERATION_REQUEST_TIMEOUT_MS);
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

function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function isComprehensivePaper(value: unknown): value is ComprehensivePaper {
  if (!value || typeof value !== 'object') return false;
  const paper = value as Partial<ComprehensivePaper>;
  return paper.status === 'generated'
    && paper.mode === 'paper'
    && typeof paper.lessonTitle === 'string'
    && typeof paper.title === 'string'
    && typeof paper.prompt === 'string'
    && paper.difficulty === 'advanced'
    && (paper.format === 'comprehensive_function' || paper.format === 'comprehensive_science')
    && typeof paper.totalPoints === 'number'
    && Array.isArray(paper.sections)
    && paper.sections.length >= 5
    && paper.sections.every((section) => (
      Boolean(section)
      && typeof section.id === 'string'
      && typeof section.title === 'string'
      && typeof section.points === 'number'
      && typeof section.prompt === 'string'
      && section.prompt.trim().length > 0
    ));
}

export function ReviewStudio() {
  const [lessonTitle, setLessonTitle] = useState('');
  const [content, setContent] = useState('');
  const [level, setLevel] = useState('التعليم الثانوي');
  const [explanation, setExplanation] = useState<ExplanationResult | null>(null);
  const [paper, setPaper] = useState<ComprehensivePaper | null>(null);
  const [explanationState, setExplanationState] = useState<GenerationState>('idle');
  const [paperState, setPaperState] = useState<GenerationState>('idle');
  const [explanationError, setExplanationError] = useState('');
  const [paperError, setPaperError] = useState('');
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
  const selectedLevelLabel = useMemo(
    () => levels.find((item) => item.value === level)?.label ?? level,
    [level],
  );

  const validate = useCallback(() => {
    if (!lessonTitle.trim() || !content.trim()) {
      setFormError('أدخل عنوان الدرس ومحتواه أولًا.');
      return false;
    }
    setFormError('');
    return true;
  }, [content, lessonTitle]);

  const generateExplanation = useCallback(async () => {
    if (!validate()) return;
    setExplanationState('loading');
    setExplanationError('');
    try {
      const result = await postJson<ExplanationResult>('/api/ai/generate-explanation', {
        lesson_title: lessonTitle.trim(),
        content: content.trim(),
        level,
      });
      setExplanation(result);
      setExplanationState('ready');
    } catch (error) {
      setExplanationState('error');
      setExplanationError(getErrorMessage(error, 'تعذر توليد الشرح حاليًا. أعد المحاولة بعد قليل.'));
    }
  }, [content, lessonTitle, level, validate]);

  const resetAttempt = () => {
    setAttemptStartedAt(null);
    setAttemptImage(null);
    setAttemptName('');
    setAttemptState('idle');
    setAttemptAnalysis(null);
    setAttemptError('');
    setAttemptElapsed(0);
    setCopilotOpen(false);
    setCopilotQuestion('');
    setCopilotAnswer('');
    setCopilotError('');
    setCopilotState('idle');
  };

  const generatePaper = useCallback(async () => {
    if (!validate()) return;
    setPaperState('loading');
    setPaperError('');
    resetAttempt();
    try {
      const result = await postJson<unknown>('/api/lesson/exercise', {
        lesson: lessonTitle.trim(),
        level,
        activeConcept: lessonTitle.trim(),
        attemptContext: content.trim().slice(0, 4000),
        mode: 'paper',
      });
      if (!isComprehensivePaper(result)) {
        throw new Error('أعاد الخادم ورقة غير مكتملة. أعد المحاولة للحصول على ورقة دقيقة.');
      }
      setPaper(result);
      setPaperState('ready');
      setAttemptStartedAt(Date.now());
    } catch (error) {
      setPaperState('error');
      setPaperError(getErrorMessage(error, 'تعذر إعداد الورقة الشاملة حاليًا. أعد المحاولة بعد قليل.'));
    }
  }, [content, lessonTitle, level, validate]);

  useEffect(() => {
    if (!attemptStartedAt || attemptState === 'ready' || attemptState === 'error') return undefined;
    const updateElapsed = () => {
      setAttemptElapsed(Math.max(0, Math.floor((Date.now() - attemptStartedAt) / 1000)));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [attemptStartedAt, attemptState]);

  const analyzePaperAttempt = async (imageDataUrl: string, fileName: string) => {
    if (!paper) return;
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
          lesson: paper.lessonTitle,
          concept: [
            paper.title,
            paper.prompt,
            `زمن المحاولة: ${formatElapsed(elapsed)}`,
            paper.sections.map((section) => `${section.title}: ${section.prompt}`).join(' | '),
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
      setAttemptName(fileName);
      setCopilotAnswer(`حللت محاولتك بعد ${formatElapsed(elapsed)}. اسألني عن الخطوة التي تريد مراجعتها، وسأقودك دون عرض الحل النموذجي.`);
      setCopilotError('');
      setCopilotState('idle');
      setCopilotOpen(false);
    } catch (error) {
      setAttemptState('error');
      setAttemptError(getErrorMessage(error, 'تعذر تحليل صورة المحاولة.'));
    }
  };

  const handleAttemptUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !paper) return;
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
    if (!paper) return;
    const text = [
      paper.title,
      `المادة: ${paper.lessonTitle}`,
      'المستوى: متقدم',
      `العلامة: ${paper.totalPoints} نقطة`,
      '',
      'أجب عن الورقة بالقلم، ثم ارفع صورة المحاولة إلى فهيم للتوجيه.',
      '',
      paper.prompt,
      '',
      paper.sections.map((section, index) => (
        `${index + 1}. ${section.prompt}`
      )).join('\n\n'),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${paper.title.replace(/[^\p{L}\p{N}\s-]/gu, '').trim() || 'ورقة-مراجعة-شاملة'}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const askPaperCopilot = async () => {
    if (!paper || !attemptAnalysis || !copilotQuestion.trim() || copilotState === 'asking') return;
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
          lesson: paper.lessonTitle,
          concept: paper.title,
          context: [
            'هذه محاولة ورقية مرفوعة من الطالب بعد حل ورقة شاملة.',
            `زمن المحاولة: ${formatElapsed(attemptElapsed)}`,
            `المطلوبات: ${paper.sections.map((section) => `${section.title}: ${section.prompt}`).join(' | ')}`,
            `آخر خطوة صحيحة: ${attemptAnalysis.lastCorrectStep}`,
            `أول موضع يحتاج مراجعة: ${attemptAnalysis.firstErrorStep}`,
            `تحليل فهيم: ${attemptAnalysis.feedback}`,
            'أجب بتوجيه تفاعلي متدرج، ولا تعرض الحل النموذجي أو المصادر أو الإجابة النهائية كاملة.',
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
      setCopilotError(getErrorMessage(error, 'تعذر رد فهيم الآن.'));
    }
  };

  const resetStudio = () => {
    setLessonTitle('');
    setContent('');
    setLevel('التعليم الثانوي');
    setExplanation(null);
    setPaper(null);
    setExplanationState('idle');
    setPaperState('idle');
    setExplanationError('');
    setPaperError('');
    setFormError('');
    setAttemptStartedAt(null);
    resetAttempt();
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
              <span>استوديو المراجعة</span>
            </div>
            <h1>ابنِ ورقة شاملة، ثم تعلّم من محاولتك.</h1>
            <p>
              يحوّل الاستوديو محتوى درسك إلى ورقة واحدة مترابطة قابلة للحل بالقلم.
              لا تظهر الإجابة أثناء المحاولة؛ بعد الرفع يحدد فهيم أول خطوة تحتاج فهمًا.
            </p>
          </div>
          <div className="review-studio-hero-note" aria-label="طريقة عمل الاستوديو">
            <div>
              <BookOpenText size={17} aria-hidden="true" />
              <div>
                <strong>ورقة واحدة لا قائمة أسئلة</strong>
                <span>معطيات، مطلوبات مترابطة، وأقسام موزونة من البداية إلى التركيب.</span>
              </div>
            </div>
            <div>
              <ShieldCheck size={17} aria-hidden="true" />
              <div>
                <strong>الحل يبقى خارج عرض الطالب</strong>
                <span>سترى المطلوب فقط، ثم تحصل على توجيه تدريجي بعد رفع محاولتك.</span>
              </div>
            </div>
          </div>
        </header>

        <div className="review-studio-grid">
          <form className="review-studio-card review-studio-input-card fade-up" onSubmit={handleSubmit}>
            <div className="review-studio-card-heading">
              <div>
                <h2>مدخل الورقة</h2>
                <p>أعطِ فهيمًا فكرة دقيقة عن الدرس قبل بناء الورقة.</p>
              </div>
              <span className="review-studio-mark" aria-hidden="true"><FileText size={19} /></span>
            </div>

            {formError && (
              <div className="review-studio-alert" role="alert" data-testid="review-studio-form-error">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="review-studio-field">
              <label htmlFor="review-studio-title">عنوان الدرس أو الوحدة</label>
              <input
                id="review-studio-title"
                data-testid="review-studio-title"
                value={lessonTitle}
                onChange={(event) => { setLessonTitle(event.target.value); setFormError(''); }}
                placeholder="مثال: دراسة شاملة للدوال العددية"
                maxLength={180}
              />
            </div>

            <div className="review-studio-field">
              <label htmlFor="review-studio-content">المحتوى الذي تريد أن تبني عليه</label>
              <textarea
                id="review-studio-content"
                data-testid="review-studio-content"
                value={content}
                onChange={(event) => { setContent(event.target.value); setFormError(''); }}
                placeholder="ألصق الدرس، الملاحظات، القوانين، أو ما تريد مراجعته..."
                maxLength={50000}
              />
              <span className="review-studio-helper">{content.length.toLocaleString('ar-DZ')} / ٥٠٬٠٠٠ حرف</span>
            </div>

            <div className="review-studio-field">
              <label htmlFor="review-studio-level">مستوى التعلّم</label>
              <select id="review-studio-level" data-testid="review-studio-level" value={level} onChange={(event) => setLevel(event.target.value)}>
                {levels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            <div className="review-studio-actions">
              <button type="submit" className="review-studio-secondary-action" data-testid="review-studio-generate-explanation" disabled={!hasInput || explanationState === 'loading'}>
                {explanationState === 'loading' ? <><RefreshCw size={16} className="review-studio-spin" /> جارٍ بناء الشرح...</> : <><WandSparkles size={16} /> توليد شرح تمهيدي</>}
              </button>
              <button type="button" className="review-studio-primary-action" data-testid="review-studio-generate-exercises" onClick={() => void generatePaper()} disabled={!hasInput || paperState === 'loading'}>
                {paperState === 'loading' ? <><RefreshCw size={16} className="review-studio-spin" /> جارٍ بناء الورقة...</> : <><ListChecks size={16} /> بناء الورقة الشاملة</>}
              </button>
              <button type="button" className="review-studio-secondary-action" data-testid="review-studio-reset" onClick={resetStudio}>بدء مراجعة جديدة</button>
            </div>

          </form>

          <section className="review-studio-results" aria-label="نتائج المراجعة">
            <article className="review-studio-card review-studio-output-card fade-up" aria-busy={explanationState === 'loading'} data-testid="review-studio-explanation-panel">
              <div className="review-studio-output-heading">
                <div><h2>الشرح التمهيدي</h2><p>{explanation?.lesson_title ?? `المستوى: ${selectedLevelLabel}`}</p></div>
                <span className="review-studio-output-badge"><CheckCircle2 size={13} /><span>{explanation ? 'جاهز' : 'بانتظار المحتوى'}</span></span>
              </div>
              <div className="review-studio-output-body" aria-live="polite">
                {explanationState === 'loading' && <LoadingBlock label="جارٍ توليد الشرح" testId="review-studio-explanation-loading" />}
                {explanationState === 'error' && <ErrorBlock message={explanationError} testId="review-studio-explanation-error" />}
                {explanationState === 'idle' && !explanation && <EmptyBlock icon={<BookOpenText size={25} />} title="سيظهر الشرح هنا" text="اكتب محتوى الدرس ثم اطلب شرحًا تمهيديًا قبل الورقة." testId="review-studio-explanation-empty" />}
                {explanation && explanationState === 'ready' && (
                  <div data-testid="review-studio-explanation-result">
                    {explanation.explanation_sections.map((section, index) => (
                      <section className="review-studio-section" key={`${section.title}-${index}`}>
                        <h3><MathText>{section.title}</MathText></h3>
                        <p><MathText>{section.content}</MathText></p>
                        {section.key_points.length > 0 && <ul className="review-studio-points">{section.key_points.map((point) => <li key={point}><MathText>{point}</MathText></li>)}</ul>}
                        {section.example && <div className="review-studio-example">مثال: <MathText>{section.example}</MathText></div>}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <article className="review-studio-card review-studio-output-card fade-up" aria-busy={paperState === 'loading'} data-testid="review-studio-exercises-panel">
              <div className="review-studio-output-heading">
                <div><h2>ورقة المراجعة الشاملة</h2><p>{paper?.lessonTitle ?? 'ابدأ بالمحاولة بالقلم قبل طلب التوجيه'}</p></div>
                <span className="review-studio-output-badge"><ListChecks size={13} /><span>{paper ? `${paper.totalPoints} نقطة` : 'لم تُنشأ بعد'}</span></span>
              </div>
              <div className="review-studio-output-body" aria-live="polite">
                {paperState === 'loading' && <LoadingBlock label="جارٍ بناء الورقة الشاملة" testId="review-studio-exercises-loading" />}
                {paperState === 'error' && <ErrorBlock message={paperError} testId="review-studio-exercises-error" />}
                {paperState === 'idle' && !paper && <EmptyBlock icon={<ListChecks size={25} />} title="ستظهر الورقة هنا" text="اطلب ورقة واحدة مترابطة بدل أسئلة اختيارية منفصلة." testId="review-studio-exercises-empty" />}
                {paper && paperState === 'ready' && (
                  <div className="review-studio-paper" data-testid="review-studio-paper-result">
                    <div className="review-studio-paper-intro">
                      <div><span className="review-studio-paper-eyebrow">ورقة {paper.format === 'comprehensive_function' ? 'دوال' : 'تطبيقية'} · محاولة مؤقتة</span><span className="review-studio-paper-difficulty">المستوى: متقدم</span><h3><MathText>{paper.title}</MathText></h3></div>
                      <div className="review-studio-paper-score"><strong>{paper.totalPoints}</strong><span>نقطة</span></div>
                    </div>
                    <p className="review-studio-paper-prompt"><MathText>{paper.prompt}</MathText></p>
                    <div className="review-studio-paper-privacy"><ShieldCheck size={15} /><span>الحل النموذجي والتغذية المرجعية مخفيان. ابدأ بمحاولتك قبل طلب التوجيه.</span></div>
                    <div className="review-studio-sections">
                      {paper.sections.map((section, index) => (
                        <article className="review-studio-paper-section" key={section.id}>
                          <span className="review-studio-paper-section-number">{index + 1}.</span>
                          <p><MathText>{section.prompt}</MathText></p>
                        </article>
                      ))}
                    </div>
                    <div className="review-studio-attempt-bar">
                      <div><Clock3 size={16} /><div><strong>زمن المحاولة</strong><span>{formatElapsed(attemptElapsed)}</span></div></div>
                      <label className="review-studio-upload-button" htmlFor="review-studio-attempt-input">
                        <Upload size={16} /> رفع صورة الورقة
                        <input id="review-studio-attempt-input" type="file" accept="image/*" capture="environment" onChange={handleAttemptUpload} hidden />
                      </label>
                      <button type="button" className="review-studio-download-button" onClick={downloadPaper}><Download size={15} /> تنزيل المطلوب</button>
                    </div>
                    {attemptName && <div className="review-studio-attempt-file"><FileImage size={14} /><span>{attemptName}</span><span>{attemptState === 'analyzing' ? 'فهيم يقرأ...' : attemptState === 'ready' ? 'تم التحليل' : ''}</span></div>}
                    {attemptError && <ErrorBlock message={attemptError} testId="review-studio-attempt-error" />}
                    {attemptAnalysis && <div className="review-studio-analysis" data-testid="review-studio-attempt-analysis"><div><small>آخر خطوة صحيحة</small><strong>{attemptAnalysis.lastCorrectStep}</strong></div><div><small>أول موضع يحتاج مراجعة</small><strong>{attemptAnalysis.firstErrorStep}</strong></div><p>{attemptAnalysis.feedback}</p><button type="button" onClick={() => setCopilotOpen(true)}><Send size={14} /> ناقش المحاولة مع فهيم</button></div>}
                  </div>
                )}
              </div>
            </article>
          </section>
        </div>
      </div>

      <PaperAttemptCopilot
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        paperTitle={paper?.title ?? 'ورقة المراجعة الشاملة'}
        attemptImage={attemptImage}
        attemptName={attemptName}
        analysis={attemptAnalysis}
        question={copilotQuestion}
        onQuestionChange={setCopilotQuestion}
        onAsk={() => void askPaperCopilot()}
        answer={copilotAnswer}
        elapsedSeconds={attemptElapsed}
        error={copilotState === 'error' ? copilotError : ''}
        isAsking={copilotState === 'asking'}
      />
    </main>
  );
}

function LoadingBlock({ label, testId }: { label: string; testId: string }) {
  return <div className="review-studio-skeleton" aria-label={label} data-testid={testId}><span className="review-studio-skeleton-line" /><span className="review-studio-skeleton-line" /><span className="review-studio-skeleton-line" /><span className="review-studio-skeleton-line" /></div>;
}

function ErrorBlock({ message, testId }: { message: string; testId: string }) {
  return <div className="review-studio-alert" role="alert" data-testid={testId}><AlertCircle size={16} aria-hidden="true" /><span>{message}</span></div>;
}

function EmptyBlock({ icon, title, text, testId }: { icon: ReactNode; title: string; text: string; testId: string }) {
  return <div className="review-studio-empty" data-testid={testId}>{icon}<strong>{title}</strong><span>{text}</span></div>;
}

export default ReviewStudio;