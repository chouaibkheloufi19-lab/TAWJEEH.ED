import { type FormEvent, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import logoPath from '@assets/tawjeeh-owl-transparent.png';

const tracks = [
  { value: 'experimental-sciences', label: 'علوم تجريبية', english: 'Experimental Sciences' },
  { value: 'mathematics', label: 'رياضيات', english: 'Mathematics' },
  { value: 'technology-engineering', label: 'تقني رياضي / هندسة', english: 'Technology & Engineering' },
];

type AuthMode = 'login' | 'register';

export default function AuthPage({ mode: initialMode = 'login' }: { mode?: AuthMode }) {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', track: '' });
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (isRegister && !form.track) {
      setError('اختر الشعبة الدراسية للمتابعة.');
      return;
    }

    if (isRegister) {
      localStorage.setItem('tawjeeh.student', JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim(),
        track: form.track,
      }));
    }
    localStorage.setItem('tawjeeh.session', 'active');
    navigate('/dashboard');
  };

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'track') setError('');
  };

  return (
    <main className="auth-page" dir="rtl">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <header className="auth-header">
        <Link href="/" className="auth-brand" data-testid="link-auth-home">
          <img src={logoPath} alt="بومة توجيه" />
          <span><strong>TAWJEEH</strong><small>مساحة التعلّم</small></span>
        </Link>
        <Link href="/" className="auth-back-link"><ArrowRight size={16} /> العودة للرئيسية</Link>
      </header>

      <section className="auth-layout">
        <aside className="auth-intro">
          <span className="auth-kicker"><GraduationCap size={16} /> رفيقك نحو البكالوريا</span>
          <h1>{isRegister ? 'ابدأ رحلتك بثقة.' : 'مرحبًا بعودتك.'}</h1>
          <p>{isRegister
            ? 'أنشئ مساحتك الخاصة، اختر شعبتك الدراسية، ودع توجيه يساعدك بخطوات واضحة كل يوم.'
            : 'واصل من حيث توقفت، واستعد لخطوتك الدراسية التالية بهدوء وتركيز.'}</p>
          <ul className="auth-benefits">
            <li><CheckCircle2 size={18} /> خطة تعلّم تناسب مستواك</li>
<<<<<<< HEAD
             <li><CheckCircle2 size={18} /> ملخصات مرتبطة بخطتك الدراسية</li>
=======
            <li><CheckCircle2 size={18} /> ملخصات واضحة من المنهاج الجزائري</li>
>>>>>>> origin/main
            <li><CheckCircle2 size={18} /> متابعة تقدّمك دون ضغط</li>
          </ul>
        </aside>

        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-tabs" role="tablist" aria-label="نوع الحساب">
            <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? 'is-active' : ''} onClick={() => switchMode('login')} data-testid="button-auth-login">تسجيل الدخول</button>
            <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? 'is-active' : ''} onClick={() => switchMode('register')} data-testid="button-auth-register">إنشاء حساب</button>
          </div>
          <div className="auth-card-heading">
            <p className="eyebrow">{isRegister ? 'حساب طالب جديد' : 'تسجيل آمن وبسيط'}</p>
            <h2 id="auth-title">{isRegister ? 'أنشئ حسابك الدراسي' : 'سجّل دخولك إلى مساحتك'}</h2>
            <p>{isRegister ? 'أدخل بياناتك لنجهّز لك تجربة أكثر ملاءمة.' : 'أدخل بياناتك للعودة إلى خطة التعلّم الخاصة بك.'}</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {isRegister && (
              <label className="auth-field">
                <span>الاسم الكامل</span>
<<<<<<< HEAD
                <div className="auth-input-wrap"><UserRound size={17} /><input value={form.name} onChange={(event) => update('name', event.target.value)} required placeholder="اكتب اسمك الكامل" autoComplete="name" data-testid="input-auth-name" /></div>
=======
                <div className="auth-input-wrap"><UserRound size={17} /><input value={form.name} onChange={(event) => update('name', event.target.value)} required placeholder="مثال: ياسين بن علي" autoComplete="name" data-testid="input-auth-name" /></div>
>>>>>>> origin/main
              </label>
            )}
            <label className="auth-field">
              <span>البريد الإلكتروني</span>
              <div className="auth-input-wrap"><Mail size={17} /><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required placeholder="name@example.com" autoComplete="email" dir="ltr" data-testid="input-auth-email" /></div>
            </label>
            <label className="auth-field">
              <span>كلمة المرور</span>
              <div className="auth-input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => update('password', event.target.value)} required minLength={6} placeholder="••••••••" autoComplete={isRegister ? 'new-password' : 'current-password'} dir="ltr" data-testid="input-auth-password" /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            </label>
            {isRegister && (
              <label className="auth-field">
                <span>الشعبة الدراسية <b>*</b></span>
                <div className="auth-input-wrap"><GraduationCap size={17} /><select value={form.track} onChange={(event) => update('track', event.target.value)} required data-testid="select-academic-track">
                  <option value="">اختر شعبتك الدراسية</option>
                  {tracks.map((track) => <option key={track.value} value={track.value}>{track.label} — {track.english}</option>)}
                </select></div>
                <small>سنستخدمها لتخصيص الدروس والاختبارات المناسبة لك.</small>
              </label>
            )}
            {error && <p className="auth-error" role="alert" data-testid="status-auth-error">{error}</p>}
            <button type="submit" className="auth-submit" data-testid="button-auth-submit">{isRegister ? 'إنشاء حسابي' : 'تسجيل الدخول'} <ArrowLeft size={17} /></button>
          </form>

          <p className="auth-switch">{isRegister ? 'لديك حساب بالفعل؟' : 'أول مرة مع توجيه؟'} <button type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')} data-testid="button-auth-switch">{isRegister ? 'سجّل الدخول' : 'أنشئ حسابًا'}</button></p>
          <p className="auth-note">بالمتابعة، أنت توافق على استخدام توجيه كمساحة تعليمية آمنة.</p>
        </section>
      </section>
    </main>
  );
}