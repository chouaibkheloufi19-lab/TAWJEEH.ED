import { type FormEvent, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  GraduationCap,
  Moon,
  Sparkles,
} from 'lucide-react';
import owlGuidingVideo from '@assets/Owl_mascot_leaning_forward_202609022335_1788425680409.mp4';
import owlThinkingVideo from '@assets/Owl_mascot_thinking_and_solving_202609022335_1788425680408.mp4';
import owlSmilingVideo from '@assets/Owl_mascot_smiling_and_nodding_202609022335_1788425680409.mp4';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';

export type PlannerIntakeValues = {
  name: string;
  branch: string;
  phone: string;
};

export type PhaseOneOnboardingProps = {
  onComplete?: () => void;
  onSkip?: () => void;
  onSignIn?: () => void;
  initialStep?: number;
};

export type PlannerIntakeCardProps = {
  initialValues?: Partial<PlannerIntakeValues>;
  onSubmit?: (values: PlannerIntakeValues) => void;
  onBack?: () => void;
};

type OwlVideoProps = {
  src: string;
  alt: string;
  className?: string;
  testId: string;
};

const onboardingSteps = [
  {
    eyebrow: 'الدور الأول',
    title: 'أنا فهيم، أرتّب لك البداية.',
    body: 'لن نطلب منك أن تعرف كل شيء الآن. أخبرني فقط من أين تبدأ، وسأحرس انتباهك من التشتت.',
    note: 'رفيقك لفهم الفكرة',
    video: owlGuidingVideo,
    accent: 'blue',
  },
  {
    eyebrow: 'التحوّل الهادئ',
    title: 'ثم يظهر المخطّط، بعينٍ أهدأ.',
    body: 'عندما أعرف دراستك وما تريد إنجازه، أتحول إلى مخطّط حكيم: يوزّع الجهد، يترك مساحة للراحة، ويقترح خطوة يمكن إنجازها.',
    note: 'مخطّطك الشخصي',
    video: owlThinkingVideo,
    accent: 'gold',
  },
] as const;

const branchOptions = [
  'علوم تجريبية',
  'رياضيات',
  'تقني رياضي / هندسة',
];

const defaultValues: PlannerIntakeValues = {
  name: '',
  branch: '',
  phone: '',
};

function OwlVideo({ src, alt, className = '', testId }: OwlVideoProps) {
  return (
    <div className={`phase-one-video-frame ${className}`} data-testid={`${testId}-frame`}>
      <video
        className="phase-one-video"
        src={src}
        autoPlay
        loop
        muted
        playsInline
        aria-label={alt}
        data-testid={testId}
      />
      <img
        className="phase-one-video-still"
        src={owlLogoPath}
        alt={alt}
        data-testid={`${testId}-fallback`}
      />
      <span className="phase-one-video-caption" data-testid={`${testId}-caption`}>
        رفيقك في الطريق
      </span>
    </div>
  );
}

function BrandLockup() {
  return (
    <div className="phase-one-brand" data-testid="phase-one-brand">
      <img src={owlLogoPath} alt="شعار توجيه" data-testid="img-phase-one-logo" />
      <span>
        <strong>TAWJEEH</strong>
        <small>مساحة تعلّم جزائرية</small>
      </span>
    </div>
  );
}

export function OwlOnboarding({
  onComplete,
  onSkip,
  onSignIn,
  initialStep = 0,
}: PhaseOneOnboardingProps) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), onboardingSteps.length - 1));
  const activeStep = onboardingSteps[step];
  const isLastStep = step === onboardingSteps.length - 1;

  const moveStep = (direction: number) => {
    setStep((current) => Math.min(Math.max(current + direction, 0), onboardingSteps.length - 1));
  };

  return (
    <section className="phase-one-onboarding" dir="rtl" data-testid="phase-one-onboarding">
      <header className="phase-one-header">
        <BrandLockup />
        <div className="phase-one-header-meta">
          <span className="phase-one-live-dot" />
          <span data-testid="status-phase-one">المرحلة الأولى · بداية واضحة</span>
          <button
            className="phase-one-quiet-button"
            type="button"
            onClick={onSkip}
            data-testid="button-skip-phase-one"
          >
            تخطّي التقديم
            <ArrowLeft size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="phase-one-onboarding-grid">
        <div className="phase-one-onboarding-copy">
          <div className="phase-one-kicker" data-testid="text-onboarding-kicker">
            <span>01</span>
            <i />
            لقاءك الأول مع توجيه
          </div>
           <h1 data-testid="heading-owl-onboarding">
             أخبرني عن بدايتك.
             <strong>وسأبني لك الخطوة الأولى.</strong>
          </h1>
          <p className="phase-one-lead" data-testid="text-onboarding-intro">
            قبل أن نصنع لك خطة، نعرّفك على المساعد الذي سيرافقك. فهيم يضيء لك الفكرة،
            والمخطّط يحمي وقتك حين تكثر عليك الخيارات.
          </p>

          <div className="phase-one-step-tabs" role="tablist" aria-label="مراحل التعريف">
            {onboardingSteps.map((item, index) => (
              <button
                key={item.eyebrow}
                className={`phase-one-step-tab ${index === step ? 'is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={index === step}
                onClick={() => setStep(index)}
                data-testid={`button-onboarding-step-${index + 1}`}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <small>{item.eyebrow}</small>
              </button>
            ))}
          </div>

          <div className={`phase-one-dialogue phase-one-dialogue-${activeStep.accent}`} aria-live="polite" data-testid="status-owl-dialogue">
            <div className="phase-one-dialogue-mark">
              <Sparkles size={16} aria-hidden="true" />
            </div>
            <div>
              <span data-testid="text-owl-dialogue-eyebrow">{activeStep.note}</span>
              <p data-testid="text-owl-dialogue">{activeStep.body}</p>
            </div>
          </div>

          <div className="phase-one-onboarding-actions">
            <button
              className="phase-one-primary-button"
              type="button"
              onClick={() => (isLastStep ? onComplete?.() : moveStep(1))}
              data-testid={isLastStep ? 'button-open-planner' : 'button-next-onboarding'}
            >
              {isLastStep ? 'لنصنع مخطّطك' : 'تابع مع فهيم'}
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            {step > 0 && (
              <button
                className="phase-one-secondary-button"
                type="button"
                onClick={() => moveStep(-1)}
                data-testid="button-previous-onboarding"
              >
                <ArrowRight size={16} aria-hidden="true" />
                عودة
              </button>
            )}
            {onSignIn && (
              <button
                className="phase-one-login-link"
                type="button"
                onClick={onSignIn}
                data-testid="button-phase-one-sign-in"
              >
                لدي حساب بالفعل
              </button>
            )}
          </div>
          <p className="phase-one-microcopy" data-testid="text-onboarding-privacy">
            لا نحتاج إلا إلى ما يساعدك فعلًا. وقتك وإيقاعك يظلان ملكك.
          </p>
        </div>

        <div className="phase-one-onboarding-visual">
          <div className="phase-one-orbit phase-one-orbit-one" />
          <div className="phase-one-orbit phase-one-orbit-two" />
          <div className="phase-one-visual-index">
            <span>الآن</span>
            <strong>{String(step + 1).padStart(2, '0')}</strong>
            <small>/ 02</small>
          </div>
          <OwlVideo
            src={activeStep.video}
            alt={`فهيم ${activeStep.eyebrow}`}
            className={`phase-one-owl-card phase-one-owl-card-${activeStep.accent}`}
            testId="video-onboarding-owl"
          />
          <div className="phase-one-float-note phase-one-float-note-top" data-testid="text-onboarding-signal">
            <span className="phase-one-note-icon"><Check size={15} aria-hidden="true" /></span>
            <span><strong>إيقاعك أولًا</strong><small>خطة لا تشبه سواك</small></span>
          </div>
          <div className="phase-one-float-note phase-one-float-note-bottom" data-testid="text-onboarding-agent">
            <span className="phase-one-note-icon phase-one-note-icon-warm"><GraduationCap size={16} aria-hidden="true" /></span>
            <span><strong>{activeStep.note}</strong><small>يتبدّل مع حاجتك</small></span>
          </div>
        </div>
      </div>

      <footer className="phase-one-footer">
        <span data-testid="text-phase-one-footer">لطلاب البكالوريا الجزائرية</span>
        <span className="phase-one-footer-rule" />
         <span>توجيه · 2024</span>
      </footer>
    </section>
  );
}

export function PlannerIntakeCard({
  initialValues,
  onSubmit,
  onBack,
}: PlannerIntakeCardProps) {
  const [values, setValues] = useState<PlannerIntakeValues>({ ...defaultValues, ...initialValues });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const update = <Key extends keyof PlannerIntakeValues>(key: Key, value: PlannerIntakeValues[Key]) => {
    setSubmitted(false);
    setError('');
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values.name.trim() || !values.branch || !values.phone.trim()) {
      setError('أضف اسمك وشعبتك ورقم هاتفك حتى نكمل بياناتك.');
      return;
    }
    setSubmitted(true);
    onSubmit?.({ ...values, name: values.name.trim() });
  };

  return (
    <section className="phase-one-planner-shell" dir="rtl" data-testid="phase-one-planner">
      <div className="phase-one-planner-intro">
        <div className="phase-one-planner-topline">
          <button className="phase-one-back-button" type="button" onClick={onBack} data-testid="button-back-to-owl">
            <ArrowRight size={16} aria-hidden="true" />
            العودة إلى فهيم
          </button>
          <span className="phase-one-planner-phase" data-testid="status-planner-phase">02 / 02 · المخطّط</span>
        </div>
        <div className="phase-one-planner-identity">
          <OwlVideo src={owlSmilingVideo} alt="المخطّط يرحّب بك" className="phase-one-mini-owl" testId="video-planner-owl" />
          <span className="phase-one-identity-line" />
          <div>
            <span>الآن نتعرّف عليك</span>
            <strong data-testid="heading-planner-intake">مخطّطك الحكيم</strong>
          </div>
        </div>
        <h1 data-testid="heading-planner-welcome">
          بعض الإشارات الصغيرة.
          <strong>خطة أذكى لك.</strong>
        </h1>
        <p data-testid="text-planner-intro">
          لا نبحث عن يوم مثالي. نبحث عن مساحة واقعية تستطيع أن تعود إليها غدًا أيضًا.
        </p>
        <div className="phase-one-planner-principle" data-testid="text-planner-principle">
          <Moon size={17} aria-hidden="true" />
          <span><strong>قاعدة المخطّط:</strong> نترك دائمًا مكانًا للراحة.</span>
        </div>
      </div>

      <form className="phase-one-intake-card" onSubmit={handleSubmit} noValidate>
        <div className="phase-one-intake-header">
          <div>
            <span className="phase-one-form-label">بيانات البداية فقط</span>
            <h2 data-testid="heading-planner-form">ابدأ بما تعرفه الآن</h2>
          </div>
          <div className="phase-one-intake-seal" aria-hidden="true">
            <CalendarDays size={20} />
          </div>
        </div>

        <label className="phase-one-field">
          <span>ما الاسم الذي أناديك به؟</span>
          <input
            type="text"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="اسمك الأول"
            autoComplete="given-name"
            data-testid="input-planner-name"
          />
        </label>

        <label className="phase-one-field">
          <span>شعبتك في البكالوريا</span>
          <select
            value={values.branch}
            onChange={(event) => update('branch', event.target.value)}
            data-testid="select-planner-branch"
          >
            <option value="">اختر شعبتك</option>
            {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </label>

        <label className="phase-one-field">
          <span>رقم الهاتف</span>
          <input
            type="tel"
            value={values.phone}
            onChange={(event) => update('phone', event.target.value)}
            placeholder="أدخل رقم هاتفك"
            autoComplete="tel"
            inputMode="tel"
            data-testid="input-planner-phone"
          />
        </label>

        <div className="phase-one-later-note" role="note" data-testid="text-planner-later-note">
          <strong>لا تحتاج إلى معرفة جدولك الآن.</strong>
          <span>أدخل موعد الاختبار فقط لاحقًا، واترك للوكيل اختيار ما تحتاجه من تطبيقات.</span>
        </div>

        {error && <p className="phase-one-form-error" role="alert" data-testid="status-planner-error">{error}</p>}

        <button className="phase-one-submit-button" type="submit" data-testid="button-submit-planner">
          {submitted ? 'تم حفظ بيانات البداية' : 'ابدأ الآن'}
          {submitted ? <Check size={18} aria-hidden="true" /> : <ArrowLeft size={18} aria-hidden="true" />}
        </button>
      </form>
    </section>
  );
}

export function PhaseOnePresentation({
  onPlannerSubmit,
  onSkip,
  onSignIn,
  initialValues,
}: {
  onPlannerSubmit?: (values: PlannerIntakeValues) => void;
  onSkip?: () => void;
  onSignIn?: () => void;
  initialValues?: Partial<PlannerIntakeValues>;
}) {
  const [view, setView] = useState<'onboarding' | 'planner'>('onboarding');
  const [submittedValues, setSubmittedValues] = useState<PlannerIntakeValues | null>(null);

  if (view === 'onboarding') {
    return (
      <OwlOnboarding
        onSkip={onSkip}
        onSignIn={onSignIn}
        onComplete={() => setView('planner')}
      />
    );
  }

  return (
    <PlannerIntakeCard
      initialValues={submittedValues ?? initialValues}
      onBack={() => setView('onboarding')}
      onSubmit={(values) => {
        setSubmittedValues(values);
        onPlannerSubmit?.(values);
      }}
    />
  );
}