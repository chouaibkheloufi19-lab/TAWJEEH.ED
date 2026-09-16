import { FileImage, LoaderCircle, MessageCircle, Send, ShieldCheck, X } from 'lucide-react';
import type { FormEvent } from 'react';

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
  error,
  isAsking,
}: PaperAttemptCopilotProps) {
  if (!open) return null;

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
            <span className="paper-attempt-dialog-icon"><MessageCircle size={16} /></span>
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
              <span>ارفع ورقة المحاولة أولًا. سيبقى الحل النموذجي ومصادر التصحيح مخفيين أثناء العمل.</span>
            </div>
          )}

          <div className="paper-attempt-dialog-thread" aria-live="polite">
            <p className="paper-attempt-dialog-welcome">
              {answer || (analysis
                ? 'أنا مرتبط بهذه المحاولة الآن. اسألني عن الخطوة التالية أو عن سبب موضع المراجعة، وسأقودك دون كشف الحل كاملًا.'
                : 'بعد رفع الورقة وتحليلها، يمكنك مناقشة خطوات محاولتك معي هنا.')}
            </p>
          </div>

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
          <p className="paper-attempt-dialog-note">
            يبقى الحل النموذجي مخفيًا حتى لا تستبدل المحاولة بالمشاهدة.
          </p>
        </div>
      </section>
    </div>
  );
}