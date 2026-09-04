import { useState } from 'react';
import { ArrowRight, CheckCircle2, Lightbulb, RotateCcw, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';

const correctAnswer = '4x-16';

function normalizeMath(value: string) {
  return value
    .replace(/[−–—]/g, '-')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function MathPractice() {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = normalizeMath(answer) === correctAnswer;

  const reset = () => {
    setAnswer('');
    setSubmitted(false);
  };

  return (
    <main className="min-h-[100dvh] bg-[#f4fbff] px-5 py-8 text-right" dir="rtl">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-4xl flex-col">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 text-[#004b75]">
            <img src={owlLogoPath} alt="شعار توجيه" className="h-11 w-11 rounded-xl object-contain" />
            <span className="leading-none">
              <strong className="block text-[18px] tracking-[-.04em]">TAWJEEH</strong>
              <small className="mt-1 block text-[10px] font-bold text-[#71818a]">مساحة التعلّم</small>
            </span>
          </Link>
          <span className="rounded-full border border-[#b3e5fc] bg-white px-4 py-2 text-xs font-extrabold text-[#005689]">
            تجربة سريعة · رياضيات
          </span>
        </header>

        <section className="grid flex-1 items-center gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div className="order-2 lg:order-1">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e8f8f5] px-3 py-2 text-xs font-extrabold text-[#2e8b7b]">
              <Sparkles size={15} />
              مراجعة مكتسبات · من السند
            </div>
            <h1 className="mb-4 text-3xl font-black leading-tight text-[#003c60] md:text-5xl">
              اشتقاق كثيرات الحدود
            </h1>
            <p className="max-w-md text-base leading-8 text-[#64748b]">
              راجع قاعدة اشتقاق الدوال كثيرات الحدود، ثم اكتب الدالة المشتقة كاملة. لا تحتاج إلى آلة حاسبة.
            </p>
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#b3e5fc] bg-white p-4 text-sm leading-7 text-[#476273] shadow-sm">
              <Lightbulb className="mt-1 shrink-0 text-[#d49b35]" size={18} />
              <p><strong className="text-[#005689]">تلميح:</strong> اشتقّ كل حد على حدة، وتذكّر أن مشتقة الثابت تساوي صفرًا.</p>
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-[#9bd1dc] bg-[#eefafd] p-4 text-xs leading-6 text-[#476273]">
              <strong className="block text-[#005689]">السند المعتمد</strong>
              واجب في الاشتقاق · الدوال العددية · التمرين 1
              <span className="mt-1 block text-[10px] text-[#71818a]">المصدر: _⁨واجب_في_الاشتقاق⁩.pdf</span>
            </div>
          </div>

          <div className="order-1 rounded-[2rem] border border-[#b3e5fc] bg-white p-6 shadow-[0_20px_60px_rgba(0,75,117,.1)] md:p-10 lg:order-2">
            <div className="mb-8 flex items-center justify-between gap-3">
              <div>
                <span className="mb-2 block text-xs font-extrabold text-[#71818a]">السؤال ١ · مستوى متوسط</span>
                <h2 className="text-xl font-black text-[#003c60]">احسب الدالة المشتقة <span dir="ltr">f′(x)</span></h2>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e6f6fb] text-lg font-black text-[#005689]">01</div>
            </div>

            <div className="mb-8 rounded-2xl bg-[#004b75] px-5 py-8 text-center text-3xl font-black tracking-wide text-white md:text-4xl" dir="ltr">
              f(x) = 2x² − 16x + 5
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (answer.trim()) setSubmitted(true);
              }}
              className="space-y-4"
            >
              <label htmlFor="math-answer" className="block text-sm font-extrabold text-[#476273]">
                إجابتك
              </label>
              <div className="flex gap-3">
                <input
                  id="math-answer"
                  type="text"
                  value={answer}
                  onChange={(event) => {
                    setAnswer(event.target.value);
                    setSubmitted(false);
                  }}
                  placeholder="اكتب f′(x)"
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#b3e5fc] bg-[#f7fcfe] px-4 text-center text-lg font-bold text-[#003c60] outline-none transition focus:border-[#2e8b7b] focus:ring-2 focus:ring-[#e8f8f5]"
                  dir="ltr"
                  aria-describedby={submitted ? 'math-feedback' : undefined}
                />
                <button type="submit" className="rounded-xl bg-[#2e8b7b] px-5 font-extrabold text-white transition hover:bg-[#256f64] disabled:cursor-not-allowed disabled:opacity-50" disabled={!answer.trim()}>
                  تحقّق
                </button>
              </div>
            </form>

            {submitted && (
              <div
                id="math-feedback"
                role="status"
                className={`mt-5 flex items-start gap-3 rounded-2xl p-4 text-sm leading-7 ${isCorrect ? 'bg-[#e8f8f5] text-[#216c5e]' : 'bg-[#fff4e8] text-[#8a5b26]'}`}
              >
                {isCorrect ? <CheckCircle2 className="mt-1 shrink-0" size={19} /> : <Lightbulb className="mt-1 shrink-0" size={19} />}
                <p>
                  {isCorrect
                    ? 'أحسنت! الإجابة صحيحة: f′(x) = 4x − 16.'
                    : 'ليست الإجابة الصحيحة بعد. اشتقّ الحدّين 2x² و−16x، ثم اجعل مشتقة الثابت 5 تساوي صفرًا.'}
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6f1f5] pt-5">
              <span className="text-xs text-[#71818a]">اكتب الدالة المشتقة بصيغة مثل: 4x − 16</span>
              {submitted && (
                <button type="button" onClick={reset} className="inline-flex items-center gap-2 text-xs font-extrabold text-[#005689] hover:text-[#2e8b7b]">
                  <RotateCcw size={14} />
                  إعادة المحاولة
                </button>
              )}
            </div>
          </div>
        </section>

        <footer className="mt-10 flex items-center justify-between gap-4 border-t border-[#d9eef5] pt-5 text-xs text-[#71818a]">
          <span>حلّها خطوة بخطوة، لا بسرعة.</span>
          <Link href="/" className="inline-flex items-center gap-2 font-extrabold text-[#005689]">
            العودة
            <ArrowRight size={14} />
          </Link>
        </footer>
      </div>
    </main>
  );
}