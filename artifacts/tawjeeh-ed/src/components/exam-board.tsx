import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, LoaderCircle, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/request';

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
  return error instanceof Error ? error.message : 'تعذر تجهيز الموضوع من مصادر المعرفة.';
}

export function ExamBoard({ onExit }: { onExit: () => void }) {
  const [exam, setExam] = useState<GeneratedExam | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithTimeout('/api/creative/exam-topic', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: 'الرياضيات',
          level: 'السنة الثالثة ثانوي',
          track: 'شعبة العلوم التجريبية',
          request: 'موضوع بكالوريا كامل حول الدوال العددية والاشتقاق والنهايات، مع وضعيات جديدة وتدرج في الصعوبة ودليل تصحيح مفصل',
        }),
      }, 55_000);
      const responseText = await response.text();
      let payload: ({ message?: string } & Partial<GeneratedExam>) | null = null;
      try {
        payload = JSON.parse(responseText) as { message?: string } & Partial<GeneratedExam>;
      } catch {
        throw new Error(
          response.status === 500
            ? 'خدمة الخادم غير مهيأة بعد. فعّل مصادقة Clerk ثم أعد المحاولة.'
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

  useEffect(() => {
    void generate();
  }, []);

  if (loading) {
    return (
      <div className="exam-board-page" dir="rtl">
        <ExamBoardToolbar onExit={onExit} onRefresh={() => undefined} disabled />
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
        <ExamBoardToolbar onExit={onExit} onRefresh={() => void generate()} />
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
              <span>التمرين {index + 1} · {section.title}</span>
              <b>{section.points} نقاط</b>
            </div>
            <p className="exam-section-theme">{section.theme}</p>
            <p>{section.context}</p>
            {section.data && <div className="math-display generated-exam-data" dir="ltr">{section.data}</div>}
            <ol>
              {section.questions.map((question) => (
                <li key={question.id}>
                  <span className="exam-question-label">{question.label} <b>({question.points} ن)</b></span>
                  <p>{question.prompt}</p>
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
          <p className="exam-correction-intro">{exam.correction.introduction}</p>
          {exam.correction.sections.map((section) => (
            <article className="correction-section" key={section.sectionId}>
              <div className="correction-section-title"><strong>{section.title}</strong><span>{section.criteria.reduce((sum, item) => sum + item.points, 0)} نقاط</span></div>
              <ol>{section.solutionSteps.map((step) => <li key={step}>{step}</li>)}</ol>
              <div className="correction-criteria">
                {section.criteria.map((criterion) => <span key={criterion.label}><b>{criterion.points} ن</b>{criterion.label}</span>)}
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

function ExamBoardToolbar({ onExit, onRefresh, disabled = false }: { onExit: () => void; onRefresh: () => void; disabled?: boolean }) {
  return (
    <div className="exam-paper-toolbar">
      <button className="secondary-button !px-3 !py-2 !text-xs" onClick={onExit} data-testid="button-exit-exam-paper"><ArrowRight size={15} /> العودة للاختبارات</button>
      <div className="exam-toolbar-actions">
        <button className="secondary-button !px-3 !py-2 !text-xs" onClick={onRefresh} disabled={disabled} data-testid="button-refresh-exam-paper"><RefreshCw size={15} /> إعادة التوليد</button>
        <button className="primary-button !px-3 !py-2 !text-xs" onClick={() => window.print()} disabled={disabled} data-testid="button-print-exam-paper"><Printer size={15} /> طباعة الموضوع</button>
      </div>
    </div>
  );
}