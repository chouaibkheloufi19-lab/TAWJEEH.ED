import { useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import "./_group.css";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    window.setTimeout(() => {
      setIsSubmitting(false);
      setMessage("تم حفظ الطلب في هذه المعاينة. يمكنك متابعة المسار من هنا.");
    }, 700);
  };

  return (
    <main className="twj-root twj-signin">
      <div className="twj-signin__grid">
        <section className="twj-signin__story" aria-label="عن مساحة توجيه">
          <div className="twj-brand" aria-label="TAWJEEH.ED">
            <span className="twj-brand__mark">ت</span>
            <span className="twj-brand__copy">
              <strong>TAWJEEH.ED</strong>
              <small>مساحة تعلّم جزائرية</small>
            </span>
          </div>

          <div className="twj-signin__story-copy">
            <span className="twj-kicker">دفتر الطالب · ٢٠٢٤ / ٢٠٢٥</span>
            <h1>ابدأ من حيث أنت، <em>وتقدّم بهدوء.</em></h1>
            <p>
              مساحة واحدة تجمع دروسك، مراجعتك، والأسئلة التي تستحق أن تتوقف عندها.
              لا ضجيج في الطريق؛ فقط خطوة واضحة تليها خطوة.
            </p>
            <div className="twj-story-note">
              <span className="twj-story-note__line" aria-hidden="true" />
              <span>منهجك الجزائري، مرتب كما تفكّر.</span>
            </div>
          </div>

          <div className="twj-signin__footer-note">
            <span aria-hidden="true" />
            جلسة هادئة، تقدّم محفوظ، وخصوصية في مكانها
          </div>
          <div className="twj-desk-sketch" aria-hidden="true" />
        </section>

        <section className="twj-signin__card-wrap" aria-label="تسجيل الدخول">
          <div className="twj-signin__card">
            <header className="twj-signin__card-header">
              <span className="twj-kicker">مرحبًا بعودتك</span>
              <h2>افتح دفتر تعلّمك</h2>
              <p>سجّل الدخول لتعود مباشرة إلى الخطة التي تركتها بالأمس.</p>
            </header>

            <form className="twj-signin__form" onSubmit={handleSubmit}>
              <div className="twj-field">
                <label htmlFor="twj-email">
                  البريد الإلكتروني
                  <span>مطلوب</span>
                </label>
                <div className="twj-input">
                  <Mail size={17} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    id="twj-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@school.dz"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="twj-field">
                <label htmlFor="twj-password">
                  كلمة المرور
                  <span>مطلوب</span>
                </label>
                <div className="twj-input">
                  <LockKeyhole size={17} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    id="twj-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="أدخل كلمة المرور"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="twj-form-row">
                <label className="twj-check">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  ابقني متصلًا على هذا الجهاز
                </label>
                <button className="twj-link-button" type="button" onClick={() => setMessage("سنرسل لك خطوات الاستعادة إلى بريدك.")}>
                  نسيت كلمة المرور؟
                </button>
              </div>

              {message && <p className="twj-inline-error" role="status">{message}</p>}

              <button className="twj-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? <KeyRound size={16} className="twj-spin" aria-hidden="true" /> : <ArrowLeft size={16} aria-hidden="true" />}
                {isSubmitting ? "نفتح مساحتك..." : "الدخول إلى توجيه"}
              </button>
            </form>

            <div className="twj-divider"><span>أو تابع بطريقة أخرى</span></div>

            <button className="twj-quiet-button" type="button" onClick={() => setMessage("سيتم تفعيل الدخول المدرسي عند ربط الحساب.")}>
              <ShieldCheck size={16} aria-hidden="true" />
              الدخول بحساب المؤسسة
            </button>

            <p className="twj-signin__card-foot">
              ليس لديك حساب بعد؟
              <button type="button" onClick={() => setMessage("جاهزون لبناء حسابك الدراسي في الخطوة التالية.")}>
                أنشئ حسابًا جديدًا
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}