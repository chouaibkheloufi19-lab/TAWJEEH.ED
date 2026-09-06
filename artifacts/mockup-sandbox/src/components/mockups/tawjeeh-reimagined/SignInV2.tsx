import { useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import "./_v2.css";

export function SignInV2() {
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
      setMessage("تم حفظ الطلب في هذه المعاينة. يمكنك متابعة مسارك الدراسي.");
    }, 700);
  };

  return (
    <main className="twjv2-root twjv2-signin">
      <div className="twjv2-signin__frame">
        <section className="twjv2-signin__story" aria-label="هوية توجيه ومسار التعلّم">
          <div>
            <div className="twjv2-brand" aria-label="TAWJEEH">
              <span className="twjv2-brand__mark" aria-hidden="true">ت</span>
              <span className="twjv2-brand__copy">
                <strong>TAWJEEH</strong>
                <small>مساحة التعلّم الجزائرية</small>
              </span>
            </div>
            <div className="twjv2-signin__brand-note">
              <b>٠١</b>
              <span>من سؤال إلى فهم، بخطوة واضحة</span>
            </div>
          </div>

          <div className="twjv2-signin__story-content">
            <span className="twjv2-kicker">دفتر الطالب · الموسم الدراسي ٢٠٢٤ / ٢٠٢٥</span>
            <h1>لا تبدأ من الصفر،<em>ابدأ من اتجاهك.</em></h1>
            <p>
              يضع توجيه دروسك وأسئلتك ومراجعتك في مسار واحد؛
              ترى أين وصلت، وما الفكرة التالية التي تستحق وقتك.
            </p>
            <div className="twjv2-learning-path" aria-label="مسار التعلّم">
              <div className="twjv2-learning-path__item">
                <span className="twjv2-learning-path__index">١</span>
                <span><strong>ثبّت الأساس</strong><small>مفاهيم المنهاج كما وردت في كتابك</small></span>
              </div>
              <div className="twjv2-learning-path__item">
                <span className="twjv2-learning-path__index">٢</span>
                <span><strong>اختبر فهمك</strong><small>أسئلة تتدرج مع مستواك، لا مع الضجيج</small></span>
              </div>
              <div className="twjv2-learning-path__item">
                <span className="twjv2-learning-path__index">٣</span>
                <span><strong>صحّح اتجاهك</strong><small>دليل يشرح الفكرة قبل النتيجة</small></span>
              </div>
            </div>
          </div>

          <div className="twjv2-signin__footer">
            <span>جلسة محفوظة · مصادر جزائرية موثقة</span>
          </div>
        </section>

        <section className="twjv2-signin__form-area" aria-label="تسجيل الدخول">
          <div className="twjv2-signin__form-card">
            <header className="twjv2-signin__form-heading">
              <span className="twjv2-kicker">مرحبًا بعودتك</span>
              <h2>افتح مسارك الدراسي</h2>
              <p>سجّل الدخول لتعود إلى آخر فكرة تركتها، دون البحث من جديد.</p>
            </header>

            <form className="twjv2-signin__form" onSubmit={handleSubmit}>
              <div className="twjv2-field">
                <label htmlFor="twjv2-email">البريد الإلكتروني <span>مطلوب</span></label>
                <div className="twjv2-input">
                  <Mail size={17} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    id="twjv2-email"
                    type="email"
                    autoComplete="email"
                    placeholder="اكتب بريدك الإلكتروني"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="twjv2-field">
                <label htmlFor="twjv2-password">كلمة المرور <span>مطلوب</span></label>
                <div className="twjv2-input">
                  <LockKeyhole size={17} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    id="twjv2-password"
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

              <div className="twjv2-form-row">
                <label className="twjv2-check">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  أبقني متصلًا على هذا الجهاز
                </label>
                <button className="twjv2-link-button" type="button" onClick={() => setMessage("سنرسل لك خطوات استعادة الوصول إلى بريدك.")}>
                  نسيت كلمة المرور؟
                </button>
              </div>

              {message && <p className="twjv2-form-message" role="status">{message}</p>}

              <button className="twjv2-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? <KeyRound size={16} className="twjv2-spin" aria-hidden="true" /> : <ArrowLeft size={16} aria-hidden="true" />}
                {isSubmitting ? "نفتح مساحتك..." : "الدخول إلى توجيه"}
              </button>
            </form>

            <div className="twjv2-signin__form-divider"><span>أو استخدم وصول المؤسسة</span></div>

            <button className="twjv2-school-button" type="button" onClick={() => setMessage("سيتم تفعيل دخول المؤسسة عند ربط حسابك المدرسي.")}>
              <ShieldCheck size={16} aria-hidden="true" />
              الدخول بحساب المؤسسة
            </button>

            <p className="twjv2-signin__account">
              أول مرة هنا؟
              <button className="twjv2-account-button" type="button" onClick={() => setMessage("سيفتح إنشاء الحساب الدراسي في الخطوة التالية.")}>
                أنشئ حسابًا جديدًا
              </button>
              <BookOpen size={13} aria-hidden="true" />
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}