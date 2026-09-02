import { ArrowLeft, ArrowUpLeft, BookOpen, CheckCircle2, GraduationCap, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import logoPath from '@assets/tawjeeh-owl-transparent.png';

const tracks = [
  { label: 'علوم تجريبية', detail: 'علوم الحياة والفيزياء', icon: '01' },
  { label: 'رياضيات', detail: 'منطق وحلّ المشكلات', icon: '02' },
  { label: 'تقني رياضي / هندسة', detail: 'تطبيق وتصميم', icon: '03' },
];

export default function TawjeehHero() {
  return (
    <main className="hero-page" dir="rtl">
      <div className="hero-background-shape hero-background-shape-one" />
      <div className="hero-background-shape hero-background-shape-two" />
      <header className="hero-header">
        <Link href="/" className="hero-brand" aria-label="TAWJEEH - الصفحة الرئيسية">
          <span className="hero-brand-mark"><img src={logoPath} alt="" /></span>
          <span><b>TAWJEEH</b><small>نتعلّم بذكاء، نتقدّم بثقة</small></span>
        </Link>
        <nav className="hero-nav" aria-label="التنقل الرئيسي">
          <Link href="/knowledge">المعرفة</Link>
          <Link href="/quizzes">الاختبارات</Link>
          <Link href="/chat">اسأل توجيه</Link>
        </nav>
        <div className="hero-header-actions">
          <Link href="/login" className="hero-login">تسجيل الدخول</Link>
          <Link href="/register" className="hero-header-cta">ابدأ الآن <ArrowUpLeft size={15} /></Link>
        </div>
        <Link href="/register" className="hero-mobile-cta" aria-label="ابدأ التعلم الآن"><ArrowUpLeft size={18} /></Link>
      </header>

      <section className="hero-content" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="kicker-star"><Sparkles size={13} /></span> رفيقك الذكي نحو البكالوريا <span className="kicker-line" /></div>
          <h1 id="hero-title">خلي التعلّم<br /><span>أقرب إليك.</span></h1>
          <p className="hero-description">منصة توجيه ترافقك من أول سؤال إلى لحظة النجاح. افهم الدرس، طبّق ما تعلّمت، وشاهد تقدّمك يكبر كل يوم.</p>
          <div className="hero-actions">
            <Link href="/register" className="hero-primary-cta">ابدأ التعلّم الآن <ArrowLeft size={18} /></Link>
            <Link href="/login" className="hero-secondary-cta"><span><BookOpen size={15} /></span> ادخل إلى مساحتك</Link>
          </div>
          <div className="hero-proof">
            <div className="proof-avatars"><span>ي</span><span>س</span><span>م</span><span>+</span></div>
            <p><strong>+12,000</strong> طالب بدأوا رحلتهم<br /><small>مع توجيه هذا الموسم</small></p>
          </div>
        </div>

        <div className="hero-visual" aria-label="مسارات التعلّم في توجيه">
          <div className="visual-glow visual-glow-one" />
          <div className="visual-glow visual-glow-two" />
          <div className="hero-path-card">
            <div className="hero-path-top"><span className="hero-path-status"><i /> مساحة تعلّم شخصية</span><span className="hero-path-mark"><GraduationCap size={17} /></span></div>
            <div className="hero-path-heading"><p>اختر مسارك، وابدأ بخطوة واضحة.</p><h2>طريقك إلى الفهم<br /><span>مصمم لك.</span></h2></div>
            <div className="hero-track-list">
              {tracks.map((track) => <div className="hero-track" key={track.label}><span className="hero-track-number">{track.icon}</span><span><strong>{track.label}</strong><small>{track.detail}</small></span><CheckCircle2 size={17} /></div>)}
            </div>
            <div className="hero-path-footer"><span>توجيه يتذكّر أين توقفت</span><Link href="/register">ابدأ الآن <ArrowLeft size={14} /></Link></div>
          </div>
          <div className="floating-note note-one"><span className="note-icon"><BookOpen size={17} /></span><span><b>تعلّم بصري</b><small>خطوة بخطوة</small></span></div>
          <div className="floating-note note-two"><span className="note-icon mint"><CheckCircle2 size={17} /></span><span><b>+ 120 نقطة</b><small>إنجاز جديد</small></span></div>
        </div>
      </section>

      <div className="hero-bottom">
        <div className="hero-scroll-hint"><span className="scroll-wheel" /> تعلّم على طريقتك</div>
        <div className="hero-trust"><span>مصمم لطلاب البكالوريا</span><i /> <span>منهج جزائري</span><i /> <span>تعلّم بدون ضغط</span></div>
      </div>
    </main>
  );
}