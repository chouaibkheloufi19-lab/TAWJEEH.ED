import { useState } from 'react';
import { ArrowRight, CheckCircle2, Lightbulb, RotateCcw, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';

type ScienceStep = {
  id: string;
  number: string;
  title: string;
  prompt: string;
  placeholder: string;
  hint: string;
  solution: string;
  accepted: string[];
};

const scienceSteps: ScienceStep[] = [
  {
    id: 'domain',
    number: '01',
    title: 'مجموعة التعريف',
    prompt: 'عيّن مجموعة تعريف الدالة f.',
    placeholder: 'اكتب Df',
    hint: 'المقام لا يساوي صفرًا.',
    solution: 'Dᶠ = ℝ \\ {1}',
    accepted: ['r\\{1}', 'r-{1}', 'r except 1', 'r sans 1', 'ir\\{1}', 'ℝ\\{1}', 'r*'],
  },
  {
    id: 'derivative',
    number: '02',
    title: 'المشتقة',
    prompt: 'احسب f′(x) وبسّط النتيجة على مجال التعريف.',
    placeholder: 'اكتب f′(x)',
    hint: 'اكتب الدالة على الشكل f(x) = x − 1 + 1/(x − 1) قبل الاشتقاق.',
    solution: 'f′(x) = x(x − 2) / (x − 1)²',
    accepted: ['x(x-2)/(x-1)^2', 'x(x−2)/(x−1)²', 'x^2-2x/(x-1)^2', '(x^2-2x)/(x-1)^2'],
  },
  {
    id: 'tangent',
    number: '03',
    title: 'المماس',
    prompt: 'اكتب معادلة المماس (T) للمنحنى عند x = 0.',
    placeholder: 'اكتب معادلة المماس',
    hint: 'استعمل الصيغة y = f′(0)(x − 0) + f(0).',
    solution: 'معادلة المماس هي y = −2.',
    accepted: ['y=-2', 'y=−2', '-2', '−2'],
  },
  {
    id: 'equation',
    number: '04',
    title: 'حل معادلة',
    prompt: 'حل في ℝ المعادلة f(x) = 2.',
    placeholder: 'اكتب قيمة x',
    hint: 'اضرب في x − 1، ثم حل المعادلة الناتجة.',
    solution: 'الحل هو x = 2.',
    accepted: ['x=2', '2'],
  },
];

function normalizeMath(value: string) {
  return value
    .replace(/[−–—]/g, '-')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(digit)))
    .replace(/[ℝ𝑅]/g, 'r')
    .replace(/\\mathbb\s*\{?\s*r\s*\}?/gi, 'r')
    .replace(/\\/g, '')
    .replace(/[{}()[\]|]/g, (character) => character === '|' ? '' : character)
    .replace(/[′']/g, '')
    .replace(/[=,:;]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function MathPractice() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const isCorrect = (step: ScienceStep) => {
    const answer = normalizeMath(answers[step.id] ?? '');
    return step.accepted.some((candidate) => normalizeMath(candidate) === answer);
  };

  const reset = () => {
    setAnswers({});
    setSubmitted({});
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
             موضوع علمي · علوم تجريبية
          </span>
        </header>

        <section className="grid flex-1 items-center gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div className="order-2 lg:order-1">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e8f8f5] px-3 py-2 text-xs font-extrabold text-[#2e8b7b]">
              <Sparkles size={15} />
              رياضيات · السنة الثالثة ثانوي
            </div>
            <h1 className="mb-4 text-3xl font-black leading-tight text-[#003c60] md:text-5xl">
              دراسة دالة ناطقة
            </h1>
            <p className="max-w-md text-base leading-8 text-[#64748b]">
              موضوع علمي متدرّج من أربعة أجزاء: مجموعة التعريف، المشتقة، المماس، ثم حل معادلة مرتبطة بالدالة.
            </p>
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#b3e5fc] bg-white p-4 text-sm leading-7 text-[#476273] shadow-sm">
              <Lightbulb className="mt-1 shrink-0 text-[#d49b35]" size={18} />
              <p><strong className="text-[#005689]">طريقة الحل:</strong> ابدأ بالمعطيات، اكتب التحويلات الوسيطة، ولا تنتقل إلى الجزء التالي قبل فهم السابق.</p>
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-[#9bd1dc] bg-[#eefafd] p-4 text-xs leading-6 text-[#476273]">
              <strong className="block text-[#005689]">المعطى</strong>
              لتكن الدالة العددية f المعرفة على مجالها بالعلاقة:
              <span className="mt-2 block text-center text-base font-black text-[#003c60]" dir="ltr">f(x) = (x² − 2x + 2) / (x − 1)</span>
              <span className="mt-2 block text-[10px] text-[#71818a]">المستوى: موضوع مركب مناسب لمسار العلوم التجريبية والرياضيات.</span>
            </div>
          </div>

          <div className="order-1 rounded-[2rem] border border-[#b3e5fc] bg-white p-6 shadow-[0_20px_60px_rgba(0,75,117,.1)] md:p-10 lg:order-2">
            <div className="mb-8 flex items-center justify-between gap-3">
              <div>
                <span className="mb-2 block text-xs font-extrabold text-[#71818a]">التمرين 01 · مستوى علمي</span>
                <h2 className="text-xl font-black text-[#003c60]">موضوع تطبيقي متعدد الخطوات</h2>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e6f6fb] text-lg font-black text-[#005689]">4/4</div>
            </div>

            <div className="mb-8 rounded-2xl bg-[#004b75] px-5 py-8 text-center text-3xl font-black tracking-wide text-white md:text-4xl" dir="ltr">
              f(x) = (x² − 2x + 2) / (x − 1)
            </div>

            <div className="space-y-4">
              {scienceSteps.map((step) => {
                const hasSubmitted = submitted[step.id] === true;
                const correct = hasSubmitted && isCorrect(step);
                return (
                  <div key={step.id} className={`rounded-2xl border p-4 ${hasSubmitted ? (correct ? 'border-[#9bd1c7] bg-[#f1fbf8]' : 'border-[#f1d4aa] bg-[#fffaf2]') : 'border-[#e6f1f5] bg-[#fbfeff]'}`}>
                    <div className="mb-3 flex items-start gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#e6f6fb] text-xs font-black text-[#005689]">{step.number}</span>
                      <div>
                        <h3 className="text-sm font-black text-[#003c60]">{step.title}</h3>
                        <p className="mt-1 text-sm leading-7 text-[#476273]">{step.prompt}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        id={`math-answer-${step.id}`}
                        type="text"
                        value={answers[step.id] ?? ''}
                        onChange={(event) => {
                          setAnswers((current) => ({ ...current, [step.id]: event.target.value }));
                          setSubmitted((current) => ({ ...current, [step.id]: false }));
                        }}
                        placeholder={step.placeholder}
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#b3e5fc] bg-white px-3 text-center text-sm font-bold text-[#003c60] outline-none transition focus:border-[#2e8b7b] focus:ring-2 focus:ring-[#e8f8f5]"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        className="rounded-xl bg-[#2e8b7b] px-4 text-xs font-extrabold text-white transition hover:bg-[#256f64] disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setSubmitted((current) => ({ ...current, [step.id]: true }))}
                        disabled={!answers[step.id]?.trim()}
                      >
                        تحقّق
                      </button>
                    </div>
                    {hasSubmitted && (
                      <div role="status" className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-6 ${correct ? 'bg-[#e8f8f5] text-[#216c5e]' : 'bg-[#fff4e8] text-[#8a5b26]'}`}>
                        {correct ? <CheckCircle2 className="mt-1 shrink-0" size={15} /> : <Lightbulb className="mt-1 shrink-0" size={15} />}
                        <p>{correct ? `إجابة صحيحة: ${step.solution}` : `راجع الخطوة. ${step.hint}`}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6f1f5] pt-5">
              <span className="text-xs text-[#71818a]">حل الأجزاء بالترتيب، ثم افتح التلميح فقط عند الحاجة.</span>
              {Object.values(submitted).some(Boolean) && (
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