import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  Download,
  FileImage,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'wouter';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';
import { MathText } from '@/components/math-text';
import { PaperAttemptCopilot } from '@/components/paper-attempt-copilot';
import { fetchWithTimeout } from '@/lib/request';

type FunctionSection = {
  id: string;
  letter: string;
  title: string;
  points: number;
  prompt: string;
};

type AttemptAnalysis = {
  firstError: string;
  firstErrorStep: string;
  lastCorrectStep: string;
  feedback: string;
};

const functionStudy: FunctionSection[] = [
  {
    id: 'domain',
    letter: 'أ',
    title: 'D_f · مجموعة التعريف | Domaine',
    points: 2,
    prompt: 'عيّن مجموعة تعريف الدالة f، ثم اذكر القيم الممنوعة وسبب منعها.',
  },
  {
    id: 'limits',
    letter: 'ب',
    title: 'lim · النهايات | Limites',
    points: 3,
    prompt: 'احسب نهايتي الدالة عند طرفي مجال التعريف وعند اللانهاية، واستنتج المقارب إن وُجد.',
  },
  {
    id: 'derivative',
    letter: 'ج',
    title: 'f′ · الاشتقاق | Dérivée',
    points: 3,
    prompt: 'احسب f′(x) وبسّطها على مجال التعريف، ثم بيّن إشارة المشتقة باستعمال كتابتها المناسبة.',
  },
  {
    id: 'variations',
    letter: 'د',
    title: 'Δf · اتجاه التغيرات | Variations',
    points: 3,
    prompt: 'استنتج اتجاه تغير f على كل مجال من مجالات تعريفها، وأنجز جدول التغيرات كاملًا مع القيم الحدية.',
  },
  {
    id: 'equations',
    letter: 'هـ',
    title: 'E_f · المعادلات والمتراجحات | Équations · Inéquations',
    points: 2,
    prompt: 'حل في ℝ المعادلة f(x)=2، ثم ناقش إشارة f(x)−2 واستنتج حلول المتراجحة المرتبطة بها.',
  },
  {
    id: 'relative-position',
    letter: 'و',
    title: 'C_f/Δ · الوضع النسبي | Position relative',
    points: 2,
    prompt: 'ادرس الوضع النسبي للمنحنى بالنسبة إلى المقارب المائل، وحدد نقاط التقاطع إن وُجدت، ثم استنتج الأعداد الحقيقية التي تحقق الشرط المطلوب.',
  },
  {
    id: 'graph',
    letter: 'ز',
    title: 'C_f · التمثيل البياني | Courbe',
    points: 3,
    prompt: 'اكتب معادلة المماس عند النقطة المطلوبة، ثم أنشئ المنحنى موضحًا المقاربات والمماس ونقاط التقاطع.',
  },
  {
    id: 'synthesis',
    letter: 'ح',
    title: 'Σ · تركيب الدراسة | Synthèse',
    points: 2,
    prompt: 'اكتب خلاصة منظمة لدراسة الدالة: المجال، النهايات، المقارب، المشتقة، التغيرات، ثم العناصر الضرورية للرسم.',
  },
];

const functionFormula = 'f(x) = (x² − 2x + 2) / (x − 1) = x − 1 + 1/(x − 1)';

function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function resizeImageForUpload(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxEdge = 1800;
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.84));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

export function MathPractice() {
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [attemptImage, setAttemptImage] = useState<string | null>(null);
  const [attemptName, setAttemptName] = useState('');
  const [attemptState, setAttemptState] = useState<'idle' | 'ready' | 'analyzing' | 'analyzed' | 'error'>('idle');
  const [attemptError, setAttemptError] = useState('');
  const [analysis, setAnalysis] = useState<AttemptAnalysis | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [copilotState, setCopilotState] = useState<'idle' | 'asking' | 'answered' | 'error'>('idle');
  const [copilotAnswer, setCopilotAnswer] = useState('');
  const [showPaperHelp, setShowPaperHelp] = useState(false);

  useEffect(() => {
    if (attemptState === 'analyzed' || attemptState === 'error') return;
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attemptState, startedAt]);

  const totalPoints = useMemo(
    () => functionStudy.reduce((sum, section) => sum + section.points, 0),
    [],
  );

  const paperText = useMemo(() => [
    'دراسة شاملة لدالة ناطقة',
    `المعطى: ${functionFormula}`,
    `العلامة: ${totalPoints} نقطة`,
    '',
    'أنجز الحل كاملًا على ورقة. اكتب التحويلات والتبريرات ولا تكتفِ بالنتائج.',
    ...functionStudy.map((section) => `${section.letter}. ${section.title} (${section.points} نقاط)\n${section.prompt}`),
  ].join('\n\n'), [totalPoints]);

  const chooseAttempt = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setAttemptError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAttemptState('error');
      setAttemptError('ارفع صورة واضحة لورقة الحل. صوّر الصفحات من الأعلى وبإضاءة جيدة.');
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
      void resizeImageForUpload(reader.result).then((imageDataUrl) => {
        setAttemptImage(imageDataUrl);
        setAttemptName(file.name);
        setAttemptState('ready');
        setAnalysis(null);
        setCopilotAnswer('');
      });
    };
    reader.readAsDataURL(file);
  };

  const submitAttempt = async () => {
    if (!attemptImage || attemptState === 'analyzing') return;
    setAttemptState('analyzing');
    setAttemptError('');
    setAnalysis(null);
    try {
      const response = await fetchWithTimeout('/api/fahim/analyze-attempt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: attemptImage,
          lesson: 'دراسة دالة ناطقة',
          concept: `${functionFormula}\n${functionStudy.map((section) => `${section.title}: ${section.prompt}`).join('\n')}`,
        }),
      });
      const payload = await response.json() as Partial<AttemptAnalysis> & { message?: string };
      if (!response.ok || !payload.firstError || !payload.firstErrorStep || !payload.lastCorrectStep || !payload.feedback) {
        throw new Error(payload.message || 'تعذر تحليل ورقة الحل.');
      }
      setAnalysis(payload as AttemptAnalysis);
      setAttemptState('analyzed');
      setCopilotOpen(true);
      setCopilotState('idle');
      setCopilotAnswer('حللت ورقتك. اسألني عن موضع الخطأ أو عن الخطوة التالية، وسأقودك دون كشف الحل كاملًا.');
    } catch (error) {
      setAttemptState('error');
      setAttemptError(error instanceof Error ? error.message : 'تعذر الاتصال بفـهيم.');
    }
  };

  const askCopilot = async () => {
    if (!copilotQuestion.trim() || !analysis || copilotState === 'asking') return;
    setCopilotState('asking');
    setCopilotAnswer('');
    try {
      const response = await fetchWithTimeout('/api/fahim/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: copilotQuestion.trim(),
          lesson: 'دراسة دالة ناطقة',
          concept: functionFormula,
          context: [
            `زمن محاولة الطالب: ${formatElapsed(elapsed)}`,
            `آخر خطوة صحيحة: ${analysis.lastCorrectStep}`,
            `أول موضع يحتاج مراجعة: ${analysis.firstErrorStep}`,
            `ملاحظة فهيم: ${analysis.feedback}`,
            'لا تكشف الحل النموذجي إلا إذا طلبه الطالب صراحة بعد المحاولة.',
          ].join('\n'),
        }),
      });
      const payload = await response.json() as { answer?: string; chat_response?: string; message?: string };
      const answer = payload.answer || payload.chat_response;
      if (!response.ok || !answer) throw new Error(payload.message || 'تعذر رد فهيم.');
      setCopilotAnswer(answer);
      setCopilotState('answered');
      setCopilotQuestion('');
    } catch (error) {
      setCopilotState('error');
      setCopilotAnswer(error instanceof Error ? error.message : 'تعذر رد فهيم الآن.');
    }
  };

  const reset = () => {
    setAttemptImage(null);
    setAttemptName('');
    setAttemptState('idle');
    setAttemptError('');
    setAnalysis(null);
    setCopilotOpen(false);
    setCopilotQuestion('');
    setCopilotAnswer('');
    setCopilotState('idle');
  };

  const downloadPaper = () => {
    const blob = new Blob([`\uFEFF${paperText}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'دراسة-شاملة-لدالة-ناطقة.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="function-practice-page" dir="rtl">
      <div className="function-practice-shell">
        <header className="function-practice-header">
          <Link href="/" className="function-practice-brand">
            <img src={owlLogoPath} alt="شعار توجيه" />
            <span><strong>TAWJEEH</strong><small>مساحة التعلّم</small></span>
          </Link>
          <div className="function-practice-header-actions">
            <span className="function-practice-chip">رياضيات · 3 ثانوي</span>
            <Link href="/" className="function-practice-back"><ArrowRight size={14} /> العودة</Link>
          </div>
        </header>

        <section className="function-practice-intro">
          <div>
            <span className="function-practice-eyebrow"><Sparkles size={14} /> ورقة تطبيقية كاملة</span>
            <h1>دراسة دالة ناطقة</h1>
            <p>ليست إجابة واحدة. أنجز الدراسة كاملة بالقلم: من المجال والنهايات إلى الاشتقاق والتمثيل البياني، ثم ارفع ورقتك ليقرأ فهيم خطواتك ويصححها.</p>
          </div>
          <div className="function-practice-timer" aria-live="polite">
            <Clock3 size={17} />
            <span><small>زمن المحاولة</small><strong>{formatElapsed(elapsed)}</strong></span>
          </div>
        </section>

        <section className="function-paper" aria-label="ورقة دراسة الدالة">
          <div className="function-paper-head">
            <div>
              <span>التمرين 01 · موضوع مركب</span>
              <h2>دراسة شاملة لدالة عددية</h2>
            </div>
            <div className="function-paper-score"><strong>{totalPoints}</strong><small>نقطة</small></div>
          </div>
          <div className="function-paper-formula" dir="ltr"><MathText>{functionFormula}</MathText></div>
          <div className="function-paper-instructions">
            <Lightbulb size={16} />
            <p><strong>تعليمة العمل:</strong> اكتب جميع التحويلات والتبريرات على الورقة. لا تنتقل إلى المطلوب التالي قبل تثبيت السابق. لن تظهر لك الإجابة النموذجية أثناء المحاولة.</p>
          </div>
          <div className="function-paper-sections">
            {functionStudy.map((section) => (
              <article key={section.id} className="function-paper-section">
                <div className="function-paper-section-title">
                  <span>{section.letter}</span>
                  <div><h3>{section.title}</h3><small>{section.points} نقاط</small></div>
                </div>
                <p><MathText>{section.prompt}</MathText></p>
                <div className="function-paper-writing-lines" aria-hidden="true"><i /><i /><i /></div>
              </article>
            ))}
          </div>
          <div className="function-paper-footer">
            <span><CheckCircle2 size={14} /> المطلوب: حل كامل ومبرر على الورق</span>
            <button type="button" onClick={downloadPaper}><Download size={14} /> تنزيل الورقة</button>
          </div>
        </section>

        <section className="attempt-card" aria-labelledby="attempt-title">
          <div className="attempt-card-heading">
            <div>
              <span className="function-practice-eyebrow"><Camera size={14} /> التصحيح بالورقة</span>
              <h2 id="attempt-title">ارفع محاولتك إلى فهيم</h2>
              <p>صوّر الورقة كاملة أو صفحة صفحة. سيقرأ ترتيب خطواتك، يحدد آخر خطوة صحيحة وأول خطأ، ثم يعطيك توجيهًا مناسبًا.</p>
            </div>
            {attemptState === 'analyzed' && <span className="attempt-state-badge"><CheckCircle2 size={13} /> تم التحليل</span>}
          </div>
          {!attemptImage ? (
            <label className="attempt-dropzone" htmlFor="function-attempt-input">
              <FileImage size={24} />
              <strong>اختر صورة ورقة الحل</strong>
              <span>JPG أو PNG · حتى 7 ميغابايت</span>
              <input id="function-attempt-input" type="file" accept="image/*" capture="environment" onChange={chooseAttempt} hidden />
            </label>
          ) : (
            <div className="attempt-preview-wrap">
              <img src={attemptImage} alt="معاينة ورقة محاولة دراسة الدالة" className="attempt-preview" />
              <div className="attempt-preview-meta">
                <span><FileImage size={14} /> {attemptName}</span>
              <button type="button" onClick={() => { setAttemptImage(null); setAttemptName(''); setAttemptState('idle'); setAnalysis(null); }}><X size={14} /> استبدال الصورة</button>
              </div>
            </div>
          )}
          {attemptError && <p className="attempt-error" role="alert">{attemptError}</p>}
          <div className="attempt-actions">
            <button type="button" className="attempt-submit" onClick={() => void submitAttempt()} disabled={!attemptImage || attemptState === 'analyzing' || attemptState === 'analyzed'}>
              {attemptState === 'analyzing' ? <LoaderCircle size={15} className="function-practice-spin" /> : <Send size={15} />}
              {attemptState === 'analyzing' ? 'فهيم يقرأ الورقة...' : attemptState === 'analyzed' ? 'أُرسلت إلى فهيم' : 'أرسلها للتصحيح'}
            </button>
            {(attemptImage || analysis || attemptError) && <button type="button" className="attempt-reset" onClick={reset}><RotateCcw size={14} /> محاولة جديدة</button>}
          </div>
        </section>

        {analysis && (
          <section className="attempt-analysis" aria-labelledby="analysis-title">
            <div className="attempt-analysis-header">
              <div><span className="function-practice-eyebrow"><Sparkles size={14} /> قراءة فهيم</span><h2 id="analysis-title">تم تحليل محاولتك</h2></div>
              <span className="attempt-analysis-time">حاولت {formatElapsed(elapsed)}</span>
            </div>
            <div className="attempt-analysis-grid">
              <div><small>آخر خطوة صحيحة</small><strong>{analysis.lastCorrectStep}</strong></div>
              <div><small>أول موضع يحتاج مراجعة</small><strong>{analysis.firstErrorStep}</strong></div>
            </div>
            <p className="attempt-feedback">{analysis.feedback}</p>
            <div className="attempt-analysis-actions">
              <button type="button" onClick={() => setCopilotOpen(true)}><MessageCircle size={15} /> ناقش المحاولة مع فهيم</button>
            </div>
          </section>
        )}

        <button type="button" className="function-practice-help" onClick={() => setShowPaperHelp((current) => !current)}><Lightbulb size={14} /> كيف أتعامل مع الورقة؟</button>
        {showPaperHelp && <p className="function-practice-help-copy">ابدأ بالمعطيات، اكتب كل تحويلة، صوّر الحل بعد مراجعته، ثم ارفع الصورة. إذا أخطأت، لن نعاقب المحاولة: سيشير فهيم إلى أول خطوة تحتاج فهمًا.</p>}
      </div>

      <PaperAttemptCopilot
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        paperTitle="دراسة شاملة لدالة ناطقة"
        attemptImage={attemptImage}
        attemptName={attemptName}
        analysis={analysis}
        question={copilotQuestion}
        onQuestionChange={setCopilotQuestion}
        onAsk={() => void askCopilot()}
        answer={copilotAnswer}
        error={copilotState === 'error' ? copilotAnswer : ''}
        isAsking={copilotState === 'asking'}
      />
    </main>
  );
}