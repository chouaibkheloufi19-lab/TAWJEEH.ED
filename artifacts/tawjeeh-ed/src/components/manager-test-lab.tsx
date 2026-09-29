import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Database,
  FlaskConical,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { fetchWithTimeout } from '@/lib/request';

type TestId = 'understanding' | 'exercise' | 'topic';
type TestState = 'idle' | 'running' | 'success' | 'error';

type TestResult = {
  state: TestState;
  payload?: Record<string, unknown>;
  error?: string;
  startedAt?: number;
  durationMs?: number;
};

type KnowledgeStatus = {
  status?: string;
  indexedNodes?: number;
  message?: string;
};

const defaultContent =
  'الدالة العددية تربط كل عنصر من مجموعة تعريفها بعدد حقيقي واحد. نحدد مجموعة التعريف، ثم ندرس النهايات والاشتقاق واتجاه التغير، ونستعمل جدول التغيرات والتمثيل البياني لدراسة الحلول.';

const defaultTopicRequest =
  'أنشئ موضوعًا تدريبيًا قصيرًا حول الدوال والنهايات والاشتقاق، يتضمن تمرينين متدرجين، مع دليل تصحيح واضح.';

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function statusLabel(state: TestState) {
  if (state === 'running') return 'جارٍ الاختبار';
  if (state === 'success') return 'ناجح';
  if (state === 'error') return 'يحتاج مراجعة';
  return 'لم يُشغّل بعد';
}

function statusClass(state: TestState) {
  if (state === 'running') return 'bg-[#fff7df] text-[#906b1c]';
  if (state === 'success') return 'bg-[#e8f8f5] text-[#237463]';
  if (state === 'error') return 'bg-[#fff0ef] text-[#a34e4e]';
  return 'bg-[#f2f7f8] text-[#64748b]';
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#f3c4be] bg-[#fff7f6] p-3 text-xs font-semibold leading-6 text-[#8f4742]" role="alert">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function SourceSummary({ payload }: { payload: Record<string, unknown> }) {
  const ids = asArray(payload.sourceNodeIds);
  const grounding = payload.grounding && typeof payload.grounding === 'object'
    ? payload.grounding as Record<string, unknown>
    : {};
  const groundedIds = asArray(grounding.retrievedNodeIds);
  const sourceDocuments = asArray(payload.sourceDocuments);
  const sourceCount = Math.max(ids.length, groundedIds.length, sourceDocuments.length);

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="card-grounding-summary">
      <div className="rounded-xl bg-[#f7fcfe] p-3">
        <span className="block text-[10px] font-bold text-[#64748b]">عقد المعرفة المستخدمة</span>
        <strong className="mono mt-1 block text-lg text-[#005689]">{sourceCount}</strong>
      </div>
      <div className="rounded-xl bg-[#f7fcfe] p-3">
        <span className="block text-[10px] font-bold text-[#64748b]">الاستناد</span>
        <strong className="mt-1 block text-sm text-[#237463]">
          {sourceCount > 0 ? 'مرتبط بالمصادر' : 'بلا مصادر'}
        </strong>
      </div>
      <div className="rounded-xl bg-[#f7fcfe] p-3">
        <span className="block text-[10px] font-bold text-[#64748b]">التحقق الآلي</span>
        <strong className="mt-1 block text-sm text-[#237463]">البنية صالحة</strong>
      </div>
    </div>
  );
}

function ResultText({ label, value }: { label: string; value: unknown }) {
  const text = asText(value);
  if (!text) return null;
  return (
    <div className="rounded-xl border border-[#dcebed] bg-white p-4">
      <span className="mb-2 block text-[10px] font-extrabold text-[#0f5966]">{label}</span>
      <p className="whitespace-pre-wrap text-sm leading-7 text-[#334e5c]">{text}</p>
    </div>
  );
}

function UnderstandingResult({ payload }: { payload: Record<string, unknown> }) {
  const sections = asArray(payload.explanation_sections);
  const keyPoints = asArray(payload.key_points).filter((item): item is string => typeof item === 'string');
  const examples = asArray(payload.examples).filter((item): item is string => typeof item === 'string');
  return (
    <div className="mt-5 space-y-3" data-testid="result-understanding">
      <ResultText label="عنوان الدرس" value={payload.lesson_title} />
      {sections.map((section, index) => {
        const item = section && typeof section === 'object' ? section as Record<string, unknown> : {};
        return (
          <article className="rounded-xl border border-[#dcebed] bg-white p-4" key={index}>
            <h4 className="mb-2 text-sm font-extrabold text-[#005689]">{asText(item.title, `جزء ${index + 1}`)}</h4>
            <p className="whitespace-pre-wrap text-sm leading-7 text-[#334e5c]">{asText(item.content)}</p>
            {asArray(item.key_points).length > 0 && (
              <ul className="mt-3 space-y-1 text-xs leading-6 text-[#64748b]">
                {asArray(item.key_points).map((point, pointIndex) => <li key={pointIndex}>• {asText(point)}</li>)}
              </ul>
            )}
            <p className="mt-3 border-t border-[#edf4f5] pt-3 text-xs leading-6 text-[#64748b]">
              <strong className="text-[#0f5966]">مثال:</strong> {asText(item.example, 'لم يُرجع النموذج مثالًا.')}
            </p>
          </article>
        );
      })}
      {keyPoints.length > 0 && <ResultText label="الخلاصة" value={keyPoints.join('\n• ')} />}
      {examples.length > 0 && <ResultText label="أمثلة إضافية" value={examples.join('\n• ')} />}
      <SourceSummary payload={payload} />
    </div>
  );
}

function ExerciseResult({ payload }: { payload: Record<string, unknown> }) {
  const sections = asArray(payload.sections);
  return (
    <div className="mt-5 space-y-3" data-testid="result-exercise">
      <ResultText label="عنوان التمرين" value={payload.title} />
      <ResultText label="الوضعية" value={payload.prompt} />
      <ResultText label="تلميح" value={payload.hint} />
      {sections.map((section, index) => {
        const item = section && typeof section === 'object' ? section as Record<string, unknown> : {};
        return (
          <article className="rounded-xl border border-[#dcebed] bg-white p-4" key={index}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-sm font-extrabold text-[#005689]">{asText(item.title, `الجزء ${index + 1}`)}</h4>
              <span className="tag bg-[#e8f8f5] text-[#237463]">{String(item.points ?? 0)} نقطة</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-[#334e5c]">{asText(item.prompt)}</p>
          </article>
        );
      })}
      <ResultText label="الحل المرجعي" value={payload.solution} />
      <div className="rounded-xl border border-[#dcebed] bg-[#f7fcfe] p-4 text-sm font-bold text-[#0f5966]">
        العلامة الإجمالية: {String(payload.total_points ?? 0)} نقطة
      </div>
      <SourceSummary payload={payload} />
    </div>
  );
}

function TopicResult({ payload }: { payload: Record<string, unknown> }) {
  const sections = asArray(payload.sections);
  const correction = payload.correction && typeof payload.correction === 'object'
    ? payload.correction as Record<string, unknown>
    : {};
  const correctionSections = asArray(correction.sections);
  return (
    <div className="mt-5 space-y-3" data-testid="result-topic">
      <ResultText label="عنوان الموضوع" value={payload.title} />
      <div className="grid gap-2 text-xs font-bold text-[#64748b] sm:grid-cols-3">
        <span className="rounded-xl bg-[#f7fcfe] p-3">المادة: {asText(payload.subject, 'غير محددة')}</span>
        <span className="rounded-xl bg-[#f7fcfe] p-3">المدة: {asText(payload.duration, 'غير محددة')}</span>
        <span className="rounded-xl bg-[#f7fcfe] p-3">العلامة: {String(payload.totalPoints ?? 0)} نقطة</span>
      </div>
      {sections.map((section, index) => {
        const item = section && typeof section === 'object' ? section as Record<string, unknown> : {};
        return (
          <article className="rounded-xl border border-[#dcebed] bg-white p-4" key={index}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-sm font-extrabold text-[#005689]">{asText(item.title, `التمرين ${index + 1}`)}</h4>
              <span className="tag bg-[#fff7df] text-[#906b1c]">{String(item.points ?? 0)} نقطة</span>
            </div>
            <p className="mb-2 text-xs leading-6 text-[#64748b]">{asText(item.theme)}</p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-[#334e5c]">{asText(item.context)}</p>
            {asText(item.data) && <p className="mt-3 rounded-lg bg-[#f7fcfe] p-3 text-xs leading-6 text-[#334e5c]">{asText(item.data)}</p>}
            <div className="mt-3 space-y-2 border-t border-[#edf4f5] pt-3">
              {asArray(item.questions).map((question, questionIndex) => {
                const current = question && typeof question === 'object' ? question as Record<string, unknown> : {};
                return <p className="text-xs leading-6 text-[#334e5c]" key={questionIndex}><strong className="text-[#0f5966]">{asText(current.label, `${questionIndex + 1}`)}.</strong> {asText(current.prompt)} <span className="text-[#64748b]">({String(current.points ?? 0)} ن)</span></p>;
              })}
            </div>
          </article>
        );
      })}
      <div className="rounded-xl border border-[#dcebed] bg-[#f7fcfe] p-4">
        <h4 className="mb-2 text-sm font-extrabold text-[#005689]">{asText(correction.title, 'دليل التصحيح')}</h4>
        <p className="mb-3 text-xs leading-6 text-[#64748b]">{asText(correction.introduction)}</p>
        <div className="space-y-2">
          {correctionSections.map((section, index) => {
            const item = section && typeof section === 'object' ? section as Record<string, unknown> : {};
            return <p className="text-xs leading-6 text-[#334e5c]" key={index}><strong>{asText(item.title, `تصحيح ${index + 1}`)}:</strong> {asArray(item.solutionSteps).map((step) => asText(step)).join(' · ')}</p>;
          })}
        </div>
      </div>
      <SourceSummary payload={payload} />
      {payload.fallback === true && <p className="rounded-xl bg-[#fff7df] p-3 text-xs font-bold leading-6 text-[#906b1c]">تم استخدام مسودة مصدرية احتياطية؛ راجعها يدويًا قبل اعتمادها.</p>}
    </div>
  );
}

function TestCard({
  id,
  title,
  description,
  result,
  onRun,
  children,
}: {
  id: TestId;
  title: string;
  description: string;
  result: TestResult;
  onRun: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="surface overflow-hidden" data-testid={`card-manager-test-${id}`}>
      <div className="flex items-start justify-between gap-4 border-b border-[#dcebed] bg-[#f7fcfe] p-5">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e6f6fb] text-[#005689]"><FlaskConical size={17} /></span>
            <h2 className="text-base font-extrabold text-[#123d50]">{title}</h2>
          </div>
          <p className="max-w-2xl text-xs leading-6 text-[#64748b]">{description}</p>
        </div>
        <span className={`tag shrink-0 ${statusClass(result.state)}`} data-testid={`status-manager-test-${id}`}>{statusLabel(result.state)}</span>
      </div>
      <div className="p-5">
        {children}
        {result.state === 'error' && result.error && <ErrorMessage message={result.error} />}
        {result.state === 'success' && result.payload && (
          <div>
            <div className="mt-5 flex items-center gap-2 text-xs font-extrabold text-[#237463]">
              <CheckCircle2 size={16} />
              <span>اكتمل الاختبار{result.durationMs ? ` خلال ${(result.durationMs / 1000).toFixed(1)} ث` : ''}.</span>
            </div>
            {id === 'understanding' && <UnderstandingResult payload={result.payload} />}
            {id === 'exercise' && <ExerciseResult payload={result.payload} />}
            {id === 'topic' && <TopicResult payload={result.payload} />}
          </div>
        )}
        <button type="button" className="primary-button mt-5" onClick={onRun} disabled={result.state === 'running'} data-testid={`button-run-manager-test-${id}`}>
          {result.state === 'running' ? <LoaderCircle size={16} className="animate-spin" /> : result.state === 'success' ? <RefreshCw size={16} /> : <Play size={16} />}
          {result.state === 'success' ? 'أعد الاختبار' : 'شغّل الاختبار'}
        </button>
      </div>
    </article>
  );
}

export function ManagerTestLab() {
  const [subject, setSubject] = useState('الرياضيات');
  const [level, setLevel] = useState('السنة الثالثة ثانوي');
  const [track, setTrack] = useState('شعبة العلوم التجريبية');
  const [lessonTitle, setLessonTitle] = useState('الدوال');
  const [content, setContent] = useState(defaultContent);
  const [topicRequest, setTopicRequest] = useState(defaultTopicRequest);
  const [exerciseCount, setExerciseCount] = useState('6');
  const [results, setResults] = useState<Record<TestId, TestResult>>({
    understanding: { state: 'idle' },
    exercise: { state: 'idle' },
    topic: { state: 'idle' },
  });
  const [knowledge, setKnowledge] = useState<KnowledgeStatus | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  const runKnowledgeCheck = async () => {
    setKnowledgeLoading(true);
    try {
      const response = await fetchWithTimeout('/api/knowledge/status', { credentials: 'include' }, 12_000);
      const payload = await response.json() as KnowledgeStatus & { message?: string };
      if (!response.ok) throw new Error(payload.message || 'تعذر قراءة حالة قاعدة المعرفة.');
      setKnowledge(payload);
    } catch (error) {
      setKnowledge({ status: 'error', message: error instanceof Error ? error.message : 'تعذر قراءة حالة قاعدة المعرفة.' });
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const runTest = async (id: TestId) => {
    const startedAt = Date.now();
    setResults((current) => ({ ...current, [id]: { state: 'running', startedAt } }));
    const endpoint = id === 'understanding' ? '/api/ai/generate-explanation' : id === 'exercise' ? '/api/ai/generate-exercises' : '/api/creative/exam-topic';
    const body = id === 'understanding'
      ? { lesson_title: lessonTitle, content, subject, level, curriculum_year: level }
      : id === 'exercise'
        ? { lesson_title: lessonTitle, content, subject, level, curriculum_year: level, exercise_count: Number(exerciseCount), exercise_types: ['practical'] }
        : { subject, level, track, request: topicRequest };
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }, 75_000);
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(asText(payload.message, 'لم يكتمل الاختبار. راجع إعداد المزود أو سجل API.'));
      const hasSources = asArray(payload.sourceNodeIds).length > 0 || (
        payload.grounding && typeof payload.grounding === 'object' &&
        asArray((payload.grounding as Record<string, unknown>).retrievedNodeIds).length > 0
      );
      if (!hasSources) throw new Error('عاد الرد بلا عقد معرفة مصدرية، لذلك لم يُعتبر صالحًا للاعتماد.');
      setResults((current) => ({ ...current, [id]: { state: 'success', payload, startedAt, durationMs: Date.now() - startedAt } }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [id]: {
          state: 'error',
          error: error instanceof Error ? error.message : 'تعذر تشغيل الاختبار.',
          startedAt,
          durationMs: Date.now() - startedAt,
        },
      }));
    }
  };

  const runAll = async () => {
    await runTest('understanding');
    await runTest('exercise');
    await runTest('topic');
  };

  const successfulTests = useMemo(() => Object.values(results).filter((result) => result.state === 'success').length, [results]);

  return (
    <div className="space-y-5" dir="rtl">
      <section className="relative overflow-hidden rounded-[1.35rem] bg-[#004b75] p-6 text-white shadow-[0_16px_38px_rgba(0,86,137,.16)] md:p-8">
        <div className="absolute -left-12 -top-16 h-48 w-48 rounded-full border-[22px] border-[#b3e5fc] opacity-30" />
        <div className="relative z-[1]">
          <div className="mb-3 flex items-center gap-2 text-[#b3e5fc]"><ShieldCheck size={17} /><span className="eyebrow !text-[#b3e5fc]">مدير التطبيق · مساحة تحقق</span></div>
          <h2 className="display max-w-3xl text-[25px] md:text-[34px]">اختبر الفهم والتمارين والمواضيع قبل اعتمادها.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#e6f6fb]">هذه الصفحة تشغّل المسارات الحقيقية للمولد. النجاح هنا يعني أن الرد مكتمل، مرتبط بمصادر المعرفة، ومطابق للبنية المتوقعة. أما سلامة القاعدة علميًا فتراجعها من النص والمراجع الظاهرة.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="primary-button bg-[#e6f6fb] text-[#005689]" onClick={() => void runAll()} data-testid="button-run-all-manager-tests"><Play size={16} /> شغّل الاختبارات الثلاثة</button>
            <span className="rounded-full border border-[#75b8d1] px-3 py-2 text-xs font-bold text-[#e6f6fb]">{successfulTests}/3 مكتملة</span>
          </div>
        </div>
      </section>

      <section className="surface p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-1">مدخل موحّد</p>
            <h2 className="display text-xl">بيانات الاختبار</h2>
            <p className="mt-2 text-xs leading-6 text-[#64748b]">عدّل النص لاختبار قاعدة أخرى. لا تُرسل المفاتيح أو أي بيانات سرية هنا.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void runKnowledgeCheck()} disabled={knowledgeLoading} data-testid="button-check-knowledge-status">
            {knowledgeLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Database size={16} />}
            {knowledgeLoading ? 'يفحص القاعدة...' : 'افحص قاعدة المعرفة'}
          </button>
        </div>
        {knowledge && (
          <div className={`mb-5 flex flex-wrap items-center gap-3 rounded-xl p-3 text-xs font-bold ${knowledge.status === 'ready' ? 'bg-[#e8f8f5] text-[#237463]' : 'bg-[#fff7df] text-[#906b1c]'}`} data-testid="status-manager-knowledge">
            {knowledge.status === 'ready' ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
            <span>{knowledge.status === 'ready' ? 'قاعدة المعرفة جاهزة' : 'قاعدة المعرفة تحتاج انتباهًا'}</span>
            {knowledge.indexedNodes !== undefined && <span className="mono">({knowledge.indexedNodes} عقدة)</span>}
            {knowledge.message && <span className="font-normal">{knowledge.message}</span>}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs font-bold text-[#475d68]">المادة<input className="mt-2 min-h-11 w-full rounded-xl border border-[#cfe2e5] bg-white px-3 text-sm outline-none focus:border-[#005689]" value={subject} onChange={(event) => setSubject(event.target.value)} data-testid="input-manager-subject" /></label>
          <label className="text-xs font-bold text-[#475d68]">المستوى / السنة<input className="mt-2 min-h-11 w-full rounded-xl border border-[#cfe2e5] bg-white px-3 text-sm outline-none focus:border-[#005689]" value={level} onChange={(event) => setLevel(event.target.value)} data-testid="input-manager-level" /></label>
          <label className="text-xs font-bold text-[#475d68]">الشعبة<input className="mt-2 min-h-11 w-full rounded-xl border border-[#cfe2e5] bg-white px-3 text-sm outline-none focus:border-[#005689]" value={track} onChange={(event) => setTrack(event.target.value)} data-testid="input-manager-track" /></label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_150px]">
          <label className="text-xs font-bold text-[#475d68]">عنوان الدرس<input className="mt-2 min-h-11 w-full rounded-xl border border-[#cfe2e5] bg-white px-3 text-sm outline-none focus:border-[#005689]" value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} data-testid="input-manager-lesson-title" /></label>
          <label className="text-xs font-bold text-[#475d68]">عدد التمارين<input type="number" min="1" max="10" className="mt-2 min-h-11 w-full rounded-xl border border-[#cfe2e5] bg-white px-3 text-sm outline-none focus:border-[#005689]" value={exerciseCount} onChange={(event) => setExerciseCount(event.target.value)} data-testid="input-manager-exercise-count" /></label>
        </div>
        <label className="mt-4 block text-xs font-bold text-[#475d68]">نص القاعدة أو محتوى الدرس<textarea className="mt-2 min-h-32 w-full resize-y rounded-xl border border-[#cfe2e5] bg-white px-3 py-3 text-sm leading-7 outline-none focus:border-[#005689]" value={content} onChange={(event) => setContent(event.target.value)} data-testid="input-manager-content" /></label>
        <label className="mt-4 block text-xs font-bold text-[#475d68]">طلب الموضوع<textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-[#cfe2e5] bg-white px-3 py-3 text-sm leading-7 outline-none focus:border-[#005689]" value={topicRequest} onChange={(event) => setTopicRequest(event.target.value)} data-testid="input-manager-topic-request" /></label>
      </section>

      <div className="grid gap-5">
        <TestCard id="understanding" title="اختبار الفهم والقاعدة" description="يتحقق من أن الشرح خرج في أقسام واضحة، مع نقاط أساسية وأمثلة، وكل ذلك مرتبط بعقد معرفة." result={results.understanding} onRun={() => void runTest('understanding')}>
          <p className="rounded-xl bg-[#f7fcfe] p-3 text-xs leading-6 text-[#64748b]">المسار: <strong className="text-[#005689]">/api/ai/generate-explanation</strong> · الهدف: التأكد من فهم القاعدة دون اختراع معلومات.</p>
        </TestCard>
        <TestCard id="exercise" title="اختبار توليد التمرين" description="ينشئ تمرينًا عمليًا متماسكًا ويعرض الوضعية، التدرج، الحل، العلامة، وعقد المصادر." result={results.exercise} onRun={() => void runTest('exercise')}>
          <p className="rounded-xl bg-[#f7fcfe] p-3 text-xs leading-6 text-[#64748b]">المسار: <strong className="text-[#005689]">/api/ai/generate-exercises</strong> · النوع المختبر: تمرين عملي موثق.</p>
        </TestCard>
        <TestCard id="topic" title="اختبار توليد الموضوع" description="يختبر ورقة موضوع كاملة مع تمرينين على الأقل، توزيع نقاط، وتصحيح مطابق، ثم يبيّن إن كانت مسودة احتياطية." result={results.topic} onRun={() => void runTest('topic')}>
          <p className="rounded-xl bg-[#f7fcfe] p-3 text-xs leading-6 text-[#64748b]">المسار: <strong className="text-[#005689]">/api/creative/exam-topic</strong> · التحقق: الورقة ودليل التصحيح والمصادر.</p>
        </TestCard>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-[#dcebed] bg-white p-4 text-xs leading-6 text-[#64748b]">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-[#0f5966]" />
        <p><strong className="text-[#0f5966]">ملاحظة اعتماد:</strong> هذه اللوحة لا تستبدل مراجعة الأستاذ للمحتوى العلمي. إذا فشل الاسترجاع أو عاد الرد بلا مصدر، سيظهر كفشل ولن يُعرض كمنتج صالح.</p>
      </div>
    </div>
  );
}