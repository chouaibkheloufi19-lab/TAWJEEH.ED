import { BrainCircuit, FileImage, LoaderCircle, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, type FormEvent } from 'react';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';

export type PaperAttemptAnalysis = {
  firstErrorStep: string;
  lastCorrectStep: string;
  feedback: string;
};

type PaperAttemptCopilotProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperTitle: string;
  attemptImage?: string | null;
  attemptName?: string;
  analysis: PaperAttemptAnalysis | null;
  question: string;
  onQuestionChange: (question: string) => void;
  onAsk: () => void;
  answer: string;
  elapsedSeconds?: number;
  error?: string;
  isAsking: boolean;
};

export function PaperAttemptCopilot({
  open,
  onOpenChange,
  paperTitle,
  attemptImage,
  attemptName,
  analysis,
  question,
  onQuestionChange,
  onAsk,
  answer,
  elapsedSeconds = 0,
  error,
  isAsking,
}: PaperAttemptCopilotProps) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onOpenChange, open]);

  if (!open) {
    if (!analysis && !attemptImage) return null;
    return (
      <button
        type="button"
        className="paper-attempt-copilot-launcher"
        onClick={() => onOpenChange(true)}
        aria-label="فتح كوبيلوت فهيم"
        data-testid="button-open-paper-copilot"
      >
        <span className="paper-attempt-copilot-launcher-aura" aria-hidden="true" />
        <img src={owlLogoPath} alt="" />
        <span><strong>فهيم</strong><small>اسألني عن محاولتك</small></span>
        <BrainCircuit size={16} aria-hidden="true" />
      </button>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAsk();
  };

  return (
    <div className="paper-attempt-modal" dir="rtl" role="presentation">
      <button
        type="button"
        className="paper-attempt-modal-backdrop"
        onClick={() => onOpenChange(false)}
        aria-label="إغلاق نافذة فهيم"
      />
      <section
        className="paper-attempt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paper-attempt-dialog-title"
      >
        <header className="paper-attempt-dialog-header">
          <div className="paper-attempt-dialog-agent">
            <span className="paper-attempt-dialog-icon">
              <img src={owlLogoPath} alt="" />
            </span>
            <div>
              <strong id="paper-attempt-dialog-title">فهيم · مراجعة المحاولة</strong>
              <small>نافذة مستقلة مرتبطة بورقة الطالب</small>
            </div>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="إغلاق فهيم">
            <X size={18} />
          </button>
        </header>

        <div className="paper-attempt-dialog-body">
          <div className="paper-attempt-dialog-paper">
            <div className="paper-attempt-dialog-paper-title">
              <FileImage size={15} />
              <div>
                <strong>{paperTitle}</strong>
                <small>{attemptName || 'ورقة المحاولة'}</small>
              </div>
            </div>
            {attemptImage && (
              <img
                src={attemptImage}
                alt="صورة ورقة محاولة الطالب"
                className="paper-attempt-dialog-image"
              />
            )}
          </div>

          {analysis ? (
            <div className="paper-attempt-dialog-analysis">
              <div>
                <small>آخر خطوة صحيحة</small>
                <strong>{analysis.lastCorrectStep}</strong>
              </div>
              <div>
                <small>أول موضع يحتاج مراجعة</small>
                <strong>{analysis.firstErrorStep}</strong>
              </div>
              <p>{analysis.feedback}</p>
            </div>
          ) : (
            <div className="paper-attempt-dialog-lock">
              <ShieldCheck size={15} />
              <span>ارفع ورقة المحاولة أولًا. سيبقى الحل النموذجي مخفيًا أثناء العمل.</span>
            </div>
          )}

          <div className="paper-attempt-dialog-thread" aria-live="polite" aria-describedby="paper-attempt-dialog-description">
            <p className="paper-attempt-dialog-welcome">
              {answer || (analysis
                ? `استغرقت محاولتك ${Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}. سأبني ردي على ما كتبته أنت، لا على عنوان الموضوع فقط.`
                : 'بعد رفع الورقة وتحليلها، يمكنك مناقشة خطوات محاولتك معي هنا.')}
            </p>
          </div>

          {analysis && (
            <div className="paper-attempt-dialog-prompts" aria-label="طرق سريعة لطلب التوجيه">
              <span><Sparkles size={12} /> اختر نوع المساعدة</span>
              {[
                'اسألني عن الخطوة التالية فقط',
                'اطرح عليّ سؤالًا يقودني دون الحل',
                'تحقق من الخطوة التي كتبتها',
              ].map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => onQuestionChange(prompt)}
                  disabled={isAsking}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {error && <p className="paper-attempt-dialog-error" role="alert">{error}</p>}

          <form className="paper-attempt-dialog-composer" onSubmit={submit}>
            <textarea
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              disabled={!analysis || isAsking}
              placeholder="مثال: لماذا كانت هذه الخطوة أول موضع يحتاج مراجعة؟"
              rows={3}
              aria-label="سؤال فهيم عن المحاولة الورقية"
            />
            <button type="submit" disabled={!analysis || !question.trim() || isAsking}>
              {isAsking ? <LoaderCircle size={15} className="paper-attempt-spin" /> : <Send size={15} />}
              {isAsking ? 'فهيم يراجع...' : 'اسأل فهيم'}
            </button>
          </form>
          <p id="paper-attempt-dialog-description" className="paper-attempt-dialog-note">
            يبقى الحل النموذجي مخفيًا حتى تطلب توجيهًا مرتبطًا بخطوتك.
          </p>
        </div>
      </section>
    </div>
  );
}