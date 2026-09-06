import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import "./_group.css";

const signedIn = false;
const owlLogoPath = "/__mockup/images/tawjeeh-owl-transparent.png";

function AuthBrand() {
  return (
    <div className="auth-gate-brand">
      <img src={owlLogoPath} alt="شعار توجيه" />
      <div><strong>TAWJEEH</strong><span>مساحة التعلّم</span></div>
    </div>
  );
}

function AuthStory() {
  return (
    <section className="auth-story" aria-label="ترحيب توجيه">
      <div className="auth-story-topline">
        <AuthBrand />
        <span className="auth-story-status"><span /> مساحة تعلّم هادئة</span>
      </div>
      <div className="auth-story-mark">
        <div className="auth-story-mark-image"><img src={owlLogoPath} alt="" /></div>
        <span>مساعدة واضحة في كل خطوة</span>
      </div>
      <div className="auth-story-copy">
        <span className="auth-story-eyebrow">مرحبًا بعودتك إلى مساحتك</span>
        <h1>أهلًا بك من جديد.</h1>
        <p>خطتك، ملخصاتك، ومساعدتك الذكية بانتظارك.</p>
      </div>
      <div className="auth-story-trust">
        <span><CheckCircle2 size={16} /> أدواتك التعليمية في مكان واحد</span>
        <span><CheckCircle2 size={16} /> تقدّم محفوظ في كل جلسة</span>
      </div>
    </section>
  );
}

function SignInCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="clerk-card">
      <button className="clerk-social" type="button"><span className="clerk-google-mark">G</span> المتابعة باستخدام Google</button>
      <div className="clerk-divider"><span>أو</span></div>
      <form className="clerk-form" onSubmit={(event) => event.preventDefault()}>
        <label className="clerk-label">البريد الإلكتروني
          <span style={{ position: "relative" }}><Mail size={16} style={{ position: "absolute", right: 14, top: 16, color: "#7894a3" }} /><input className="clerk-input" style={{ paddingRight: 40 }} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" dir="ltr" required /></span>
        </label>
        <label className="clerk-label">كلمة المرور
          <span style={{ position: "relative" }}><LockKeyhole size={16} style={{ position: "absolute", right: 14, top: 16, color: "#7894a3" }} /><input className="clerk-input" style={{ paddingRight: 40, paddingLeft: 42 }} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" dir="ltr" required /><button type="button" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", left: 12, top: 13, border: 0, color: "#7894a3", background: "transparent" }}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
        </label>
        <button className="clerk-primary" type="submit">تسجيل الدخول</button>
      </form>
      <p className="clerk-footer">ليس لديك حساب؟ <button type="button">أنشئ حسابًا</button></p>
      <p className="clerk-legal">بالمتابعة، أنت توافق على استخدام توجيه كمساحة تعليمية آمنة.</p>
    </div>
  );
}

function AuthPageFrame() {
  return (
    <main className="clerk-auth-page" dir="rtl">
      <AuthStory />
      <section className="clerk-auth-form-column" aria-label="تسجيل الدخول">
        <div className="clerk-auth-heading">
          <span className="auth-form-kicker">دخول آمن وبسيط</span>
          <h2>سجّل دخولك إلى مساحتك</h2>
          <p>واصل من حيث توقفت، بخطوة واضحة واحدة.</p>
        </div>
        <SignInCard />
      </section>
    </main>
  );
}

export function Current() {
  return signedIn ? <div className="tawjeeh-auth" dir="rtl" /> : <div className="tawjeeh-auth"><AuthPageFrame /></div>;
}