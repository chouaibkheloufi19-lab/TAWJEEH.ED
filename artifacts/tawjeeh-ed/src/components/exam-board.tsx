import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, FileText, LoaderCircle, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/request';
import { MathText } from '@/components/math-text';

type ExamSource = { title: string; source: string; page: number };
type ExamQuestion = {
  id: string;
  label: string;
  prompt: string;
  points: number;
};
type ExamSection = {
  id: string;
  title: string;
  points: number;
  theme: string;
  context: string;
  data?: string;
  questions: ExamQuestion[];
};
type CorrectionSection = {
  sectionId: string;
  title: string;
  solutionSteps: string[];
  criteria: Array<{ label: string; points: number }>;
};
type GeneratedExam = {
  status: 'generated';
  title: string;
  subject: string;
  track: string;
  grade: string;
  duration: string;
  totalPoints: number;
  instructions: string[];
  sections: ExamSection[];
  correction: {
    title: string;
    introduction: string;
    sections: CorrectionSection[];
  };
  sourceDocuments: ExamSource[];
  grounding: { retrievedNodeIds: string[] };
};

function formatError(error: unknown) {
  if (!(error instanceof Error)) return 'تعذر تجهيز الموضوع من مصادر المعرفة.';
  if (/failed to fetch|network error/i.test(error.message)) {
    return 'تعذر الاتصال بمسار توليد موضوع البكالوريا. تحقّق من اتصال API ثم أعد المحاولة.';
  }
  return error.message;
}

export function ExamBoard({ onExit }: { onExit: () => void }) {
  const [exam, setExam] = useState<GeneratedExam | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('الرياضيات');
  const [level, setLevel] = useState('السنة الثالثة ثانوي');
  const [track, setTrack] = useState('شعبة العلوم التجريبية');
  const [request, setRequest] = useState(
    'موضوع بكالوريا كامل حول الدوال العددية والاشتقاق والنهايات، مع تدرج في الصعوبة ودليل تصحيح مفصل',
  );

  const generate = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!subject.trim() || !level.trim() || !track.trim() || !request.trim()) {
      setError('أكمل المادة والمستوى والشعبة وطلب التوليد قبل المتابعة.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithTimeout('/api/creative/exam-topic', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          level: level.trim(),
          track: track.trim(),
          request: request.trim(),
        }),
      }, 55_000);
      const responseText = await response.text();
      let payload: ({ message?: string } & Partial<GeneratedExam>) | null = null;
      try {
        payload = JSON.parse(responseText) as { message?: string } & Partial<GeneratedExam>;
      } catch {
        throw new Error(
          response.status === 502
            ? 'أعاد مسار توليد موضوع البكالوريا HTTP 502 دون تفاصيل. لم يُعرض موضوع بديل؛ أعد المحاولة، وإذا تكرر الخطأ فتحقّق من سجل API.'
            : response.status === 503
              ? 'خدمة التوليد غير متاحة مؤقتًا. أعد المحاولة بعد قليل.'
              : response.status === 500
                ? 'خدمة API لم تبدأ بصورة صحيحة. تحقّق من سجل تشغيل الخادم ثم أعد المحاولة.'
            : 'استجابت الخدمة بصيغة غير متوقعة. أعد المحاولة.',
        );
      }
      if (!response.ok || payload.status !== 'generated') {
        throw new Error(payload.message || 'لم تكتمل عملية التوليد grounded.');
      }
      setExam(payload as GeneratedExam);
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const requestForm = (
    <ExamGenerationForm
      subject={subject}
      level={level}
      track={track}
      request={request}
      loading={loading}
      onSubjectChange={setSubject}
      onLevelChange={setLevel}
      onTrackChange={setTrack}
      onRequestChange={setRequest}
      onSubmit={generate}
    />
  );

  if (loading) {
    return (
      <div className="exam-board-page" dir="rtl">
        <ExamBoardToolbar onExit={onExit} onRefresh={() => void generate()} disabled />
        {requestForm}
        <div className="exam-paper exam-paper-loading" aria-busy="true" data-testid="state-exam-generating">
          <div className="exam-loading-seal"><LoaderCircle size={28} className="animate-spin" /></div>
          <p className="exam-paper-kicker">TAWJEEH.ED · GROUNDING</p>
          <h1>نحلّل مكتسبات المنهاج ونبني الموضوع...</h1>
          <p>يجري الآن ربط التمرينات بعقد المعرفة، ثم ترتيبها في ورقة واحدة مع دليل تصحيح قابل للتتبع.</p>
          <div className="exam-loading-lines" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="exam-board-page" dir="rtl">
        <ExamBoardToolbar onExit={onExit} onRefresh={() => void generate()} disabled={!error} printDisabled />
        {requestForm}
        <div className="exam-paper exam-paper-error" role="alert" data-testid="state-exam-generation-error">
          <div className="exam-error-icon"><FileText size={26} /></div>
          <p className="exam-paper-kicker">لم يُعتمد الموضوع</p>
          <h1>نحتاج إلى اتصال كامل بالمصادر</h1>
          <p>{error || 'لم يرجع مولّد الموضوع بنية امتحان صالحة.'}</p>
          <p className="exam-error-note"><ShieldCheck size={15} /> لن نعرض موضوعًا غير موثق أو نملأ الفراغات بتخمينات.</p>
          <button className="primary-button" onClick={() => void generate()} data-testid="button-retry-exam-generation"><RefreshCw size={16} /> أعد المحاولة</button>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-board-page" dir="rtl">
      <ExamBoardToolbar onExit={onExit} onRefresh={() => void generate()} />
      {requestForm}
      <article className="exam-paper generated-exam-paper" data-testid="card-generated-grounded-exam">
        <header className="exam-paper-header">
          <div>
            <p>الجمهورية الجزائرية الديمقراطية الشعبية</p>
            <p>وزارة التربية الوطنية</p>
          </div>
          <div className="exam-paper-brand">
            <div className="exam-paper-mark"><strong>ت</strong><span>T</span></div>
            <strong>TAWJEEH</strong>
            <span>مساحة التعلّم</span>
          </div>
          <div className="exam-paper-header-left">
            <p>موضوع مولّد ومراجع</p>
            <p>ورقة تدريبية · {new Date().getFullYear()} / {new Date().getFullYear() + 1}</p>
          </div>
        </header>

        <div className="exam-paper-title">
          <p className="exam-paper-kicker">{exam.subject} · {exam.track}</p>
          <h1>{exam.title}</h1>
          <div className="exam-paper-meta">
            <span>المستوى: {exam.grade}</span>
            <span>المدة: {exam.duration}</span>
            <span>العلامة: {exam.totalPoints} نقطة</span>
          </div>
        </div>

        <div className="exam-paper-note">
          <strong>تعليمات المترشح:</strong>
          <ul>{exam.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ul>
        </div>

        {exam.sections.map((section, index) => (
          <section className="exam-paper-section grounded-exam-section" key={section.id}>
            <div className="exam-paper-section-heading">
              <span>التمرين {index + 1}</span>
              <b>{section.points} نقاط</b>
            </div>
             <p><MathText>{[section.theme, section.context].filter(Boolean).join('\n')}</MathText></p>
             {section.data && <MathText className="math-display generated-exam-data" block>{section.data}</MathText>}
            <ol>
              {section.questions.map((question) => (
                <li key={question.id}>
                  <span className="exam-question-label">{question.label} <b>({question.points} ن)</b></span>
                   <p><MathText>{question.prompt}</MathText></p>
                  <div className="answer-space" aria-hidden="true" />
                </li>
              ))}
            </ol>
          </section>
        ))}

        <section className="exam-correction" data-testid="card-exam-correction">
          <div className="exam-correction-heading">
            <div><span className="exam-paper-kicker">التصحيح النموذجي · قابل للتتبع</span><h2>{exam.correction.title}</h2></div>
            <span className="correction-stamp"><CheckCircle2 size={15} /> معتمد من المصادر</span>
          </div>
           <p className="exam-correction-intro"><MathText>{exam.correction.introduction}</MathText></p>
          {exam.correction.sections.map((section) => (
            <article className="correction-section" key={section.sectionId}>
              <div className="correction-section-title"><strong><MathText>{section.title}</MathText></strong><span>{section.criteria.reduce((sum, item) => sum + item.points, 0)} نقاط</span></div>
              <ol>{section.solutionSteps.map((step) => <li key={step}><MathText>{step}</MathText></li>)}</ol>
              <div className="correction-criteria">
                 {section.criteria.map((criterion) => <span key={criterion.label}><b>{criterion.points} ن</b><MathText>{criterion.label}</MathText></span>)}
              </div>
            </article>
          ))}
        </section>

        <footer className="exam-paper-footer">
          <span>موضوع مبني على {exam.grounding.retrievedNodeIds.length} عقد معرفية مسترجعة</span>
          <span>TAWJEEH.ED · CORRECTION GUIDELINES</span>
        </footer>
        <div className="exam-source-strip">
          <span><ShieldCheck size={13} /> مراجع المنهاج المستخدمة:</span>
          {exam.sourceDocuments.slice(0, 4).map((source) => <span key={`${source.source}-${source.page}`}>{source.source} · ص {source.page}</span>)}
        </div>
      </article>
    </div>
  );
}

function ExamGenerationForm({
  subject,
  level,
  track,
  request,
  loading,
  onSubjectChange,
  onLevelChange,
  onTrackChange,
  onRequestChange,
  onSubmit,
}: {
  subject: string;
  level: string;
  track: string;
  request: string;
  loading: boolean;
  onSubjectChange: (value: string) => void;
  onLevelChange: (value: string) => void;
  onTrackChange: (value: string) => void;
  onRequestChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="exam-generation-form" onSubmit={onSubmit} aria-label="إعداد طلب توليد الموضوع">
      <div className="exam-generation-heading">
        <div>
          <span className="exam-paper-kicker">إعداد الموضوع</span>
          <h2>حدّد ما تريد توليده</h2>
        </div>
        <button className="primary-button" type="submit" disabled={loading || !subject.trim() || !level.trim() || !track.trim() || !request.trim()} data-testid="button-generate-requested-exam">
          {loading ? <><LoaderCircle size={15} className="animate-spin" /> جارٍ التوليد</> : <><FileText size={15} /> توليد حسب الطلب</>}
        </button>
      </div>
      <div className="exam-generation-fields">
        <label className="exam-generation-field">
          <span>المادة</span>
          <input aria-label="المادة المطلوبة" value={subject} onChange={(event) => onSubjectChange(event.target.value)} maxLength={120} required disabled={loading} />
        </label>
        <label className="exam-generation-field">
          <span>المستوى</span>
          <input aria-label="المستوى الدراسي" value={level} onChange={(event) => onLevelChange(event.target.value)} maxLength={120} required disabled={loading} />
        </label>
        <label className="exam-generation-field">
          <span>الشعبة</span>
          <input aria-label="الشعبة الدراسية" value={track} onChange={(event) => onTrackChange(event.target.value)} maxLength={120} required disabled={loading} />
        </label>
        <label className="exam-generation-field exam-generation-request">
          <span>طلب التوليد</span>
          <textarea aria-label="ما الذي تريد توليده؟" value={request} onChange={(event) => onRequestChange(event.target.value)} maxLength={5000} rows={3} required disabled={loading} />
          <small>هذا المسار يبني موضوعًا من تمرينين إلى 8 تمارين، مع تصحيح مطابق للمصادر.</small>
        </label>
      </div>
    </form>
  );
}

function ExamBoardToolbar({ onExit, onRefresh, disabled = false, printDisabled = false }: { onExit: () => void; onRefresh: () => void; disabled?: boolean; printDisabled?: boolean }) {
  return (
    <div className="exam-paper-toolbar">
      <button className="secondary-button !px-3 !py-2 !text-xs" onClick={onExit} data-testid="button-exit-exam-paper"><ArrowRight size={15} /> العودة للاختبارات</button>
      <div className="exam-toolbar-actions">
        <button className="secondary-button !px-3 !py-2 !text-xs" onClick={onRefresh} disabled={disabled} data-testid="button-refresh-exam-paper"><RefreshCw size={15} /> إعادة التوليد</button>
        <button className="primary-button !px-3 !py-2 !text-xs" onClick={() => window.print()} disabled={disabled || printDisabled} data-testid="button-print-exam-paper"><Printer size={15} /> طباعة الموضوع</button>
      </div>
    </div>
  );
}