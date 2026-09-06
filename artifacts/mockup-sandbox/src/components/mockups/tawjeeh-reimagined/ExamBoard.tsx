import { useState } from "react";
import { BookOpen, CheckCircle2, FileCheck2, Printer, RefreshCw, ShieldCheck, Sparkles, Timer } from "lucide-react";
import "./_group.css";

const sources = [
  { page: "ص ٤٢", title: "الكتاب المدرسي · الدوال العددية", meta: "وزارة التربية الوطنية · طبعة ٢٠٢٤" },
  { page: "ص ٧٨", title: "الاشتقاق وتطبيقاته", meta: "الوحدة الثالثة · مرجع المنهاج" },
  { page: "ص ١١٦", title: "نماذج بكالوريا محلولة", meta: "الديوان الوطني للتعليم والتكوين" },
];

export function ExamBoard() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);

  const regenerate = () => {
    setIsGenerating(true);
    window.setTimeout(() => setIsGenerating(false), 1200);
  };

  return (
    <main className="twj-root twj-exam">
      <header className="twj-exam__topbar">
        <div className="twj-brand" aria-label="TAWJEEH.ED">
          <span className="twj-brand__mark">ت</span>
          <span className="twj-brand__copy">
            <strong>TAWJEEH.ED</strong>
            <small>مختبر الاختبارات</small>
          </span>
        </div>
        <div className={`twj-exam__status ${isGenerating ? "is-loading" : ""}`} role="status">
          <i aria-hidden="true" />
          {isGenerating ? "نعيد بناء الموضوع من المصادر..." : "الموضوع جاهز للمراجعة"}
        </div>
        <div className="twj-exam__top-actions">
          <button className="twj-exam__top-action" type="button" onClick={regenerate} disabled={isGenerating}>
            <RefreshCw size={14} aria-hidden="true" />
            إعادة التوليد
          </button>
          <button className="twj-exam__top-action twj-exam__top-action--solid" type="button" onClick={() => window.print()} disabled={isGenerating}>
            <Printer size={14} aria-hidden="true" />
            طباعة
          </button>
        </div>
      </header>

      <div className="twj-exam__layout">
        <section className="twj-exam__reading" aria-label="ورقة الاختبار">
          <div className="twj-exam__reading-intro">
            <div>
              <span className="twj-kicker">ورقة تدريبية · قراءة ومراجعة</span>
              <h1>موضوع الرياضيات، من الفكرة إلى البرهان.</h1>
              <p>أنشأه توجيه من مكتبتك الدراسية — يمكنك القراءة، الحل، ثم الرجوع إلى دليل التصحيح.</p>
            </div>
          </div>

          <article className="twj-exam__paper">
            <header className="twj-exam__paper-head">
              <div>
                <p>الجمهورية الجزائرية الديمقراطية الشعبية</p>
                <p>وزارة التربية الوطنية</p>
              </div>
              <div className="twj-paper-mark" aria-label="علامة توجيه">
                ت<span>T</span>
              </div>
              <div>
                <p>موضوع مولّد ومراجع</p>
                <p>جلسة ٠٧ · السنة الدراسية ٢٠٢٤ / ٢٠٢٥</p>
              </div>
            </header>

            <div className="twj-exam__paper-title">
              <span className="twj-exam__paper-kicker">الرياضيات · شعبة العلوم التجريبية</span>
              <h2>الدوال العددية والاشتقاق</h2>
              <div className="twj-exam__meta">
                <span>السنة الثالثة ثانوي</span>
                <span><Timer size={11} /> ساعتان</span>
                <span>٢٠ نقطة</span>
              </div>
            </div>

            <div className="twj-exam__instructions">
              <strong>تعليمات المترشح</strong>
              <ul>
                <li>يُسمح باستعمال الآلة الحاسبة غير المبرمجة.</li>
                <li>يجب تبرير كل نتيجة وكتابة خطوات الحل بوضوح.</li>
              </ul>
            </div>

            <section className="twj-exam__section">
              <div className="twj-exam__section-heading">
                <strong>التمرين الأول · قراءة منحنى</strong>
                <span>٠٦ نقاط</span>
              </div>
              <p>لتكن الدالة العددية f المعرفة على المجال ]−∞، +∞[ بتمثيلها البياني الآتي، ولتكن النقطة A فاصلة منحناها ٢.</p>
              <div className="twj-math">f(x) = x² − 4x + 1</div>
              <ol className="twj-exam__questions">
                <li className="twj-exam__question">احسب العدد f(٢)، ثم عيّن إحداثيي النقطة التي تمثل القيمة الصغرى للدالة. <b>(٢ ن)</b><div className="twj-answer-lines" aria-hidden="true"><i /><i /></div></li>
                <li className="twj-exam__question">ادرس اتجاه تغير الدالة f على مجال تعريفها وأنشئ جدول تغيراتها. <b>(٤ ن)</b><div className="twj-answer-lines" aria-hidden="true"><i /><i /><i /></div></li>
              </ol>
            </section>

            <section className="twj-exam__section">
              <div className="twj-exam__section-heading">
                <strong>التمرين الثاني · من الاشتقاق إلى القرار</strong>
                <span>٠٨ نقاط</span>
              </div>
              <p>يمثل p(t) عدد الوحدات المنتجة في ورشة صغيرة بعد t ساعات من العمل. نقرّب هذا العدد بالدالة التالية:</p>
              <div className="twj-math">p(t) = −t³ + 9t² + 12t &nbsp;&nbsp; ; &nbsp;&nbsp; 0 ≤ t ≤ 6</div>
              <ol className="twj-exam__questions">
                <li className="twj-exam__question">احسب p′(t) واستنتج قيمة t التي تجعل الإنتاج في أقصاه. <b>(٤ ن)</b><div className="twj-answer-lines" aria-hidden="true"><i /><i /></div></li>
                <li className="twj-exam__question">فسّر النتيجة في سياق الورشة، واقترح توقيتًا مناسبًا للتوقف. <b>(٤ ن)</b><div className="twj-answer-lines" aria-hidden="true"><i /></div></li>
              </ol>
            </section>

            <div className={`twj-correction ${isGenerating ? "is-refreshing" : ""}`} data-testid="correction-guide">
              <div className="twj-correction__heading">
                <div>
                  <span className="twj-exam__paper-kicker">دليل التصحيح · قابل للتتبع</span>
                  <h2>لا تحفظ النتيجة. افهم مسارها.</h2>
                </div>
                <span className="twj-correction__stamp"><CheckCircle2 size={14} /> موثّق بالمصادر</span>
              </div>
              <p className="twj-correction__intro">هذا الدليل يشرح أين تُحتسب العلامة، وما الفكرة التي ينبغي أن تظهر في ورقتك — لا يكتفي بعرض الحل النهائي.</p>

              <article className="twj-correction__section">
                <div className="twj-correction__section-heading">
                  <strong>التمرين الأول · السؤال ٢</strong>
                  <span>٠٤ نقاط</span>
                </div>
                <ol>
                  <li>نحسب المشتقة: f′(x) = ٢x − ٤.</li>
                  <li>نحل f′(x) = ٠ فنجد x = ٢، ثم ندرس إشارة المشتقة.</li>
                  <li>نستنتج أن الدالة تتناقص ثم تتزايد، ومنه قيمة صغرى عند x = ٢.</li>
                </ol>
                <div className="twj-criteria">
                  <span><b>١ ن</b> حساب المشتقة</span>
                  <span><b>٢ ن</b> جدول الإشارة</span>
                  <span><b>١ ن</b> تفسير النتيجة</span>
                </div>
              </article>

              <article className="twj-correction__section">
                <div className="twj-correction__section-heading">
                  <strong>التمرين الثاني · السؤال ١</strong>
                  <span>٠٤ نقاط</span>
                </div>
                <ol>
                  <li>نستعمل قاعدة اشتقاق مجموع الحدود لنحصل على p′(t) = −٣t² + ١٨t + ١٢.</li>
                  <li>نحدد إشارة p′ على المجال، ثم نربطها بتغير عدد الوحدات.</li>
                </ol>
                <div className="twj-criteria">
                  <span><b>٢ ن</b> الاشتقاق</span>
                  <span><b>٢ ن</b> الاستنتاج</span>
                </div>
              </article>

              <footer className="twj-paper-footer">
                <span>٣ عقد معرفية مسترجعة · ٩٤٪ تطابق مع المنهاج</span>
                <span>TAWJEEH.ED / CORRECTION</span>
              </footer>
            </div>
          </article>
        </section>

        <aside className="twj-exam__sources" aria-label="مصادر الموضوع">
          <section className="twj-trust-card">
            <div className="twj-trust-card__heading">
              <div>
                <span className="twj-kicker">سلسلة الثقة</span>
                <h3>موضوع يمكن الرجوع إليه</h3>
              </div>
              <span className="twj-trust-card__icon"><ShieldCheck size={18} aria-hidden="true" /></span>
            </div>
            <p>كل سؤال مرتبط بعقدة من مكتبة المنهاج. عندما تتغير الإجابة، نعرف أي فكرة تحتاج إلى مراجعة.</p>
            <div className="twj-trust-meter">
              <div className="twj-trust-meter__row"><span>قوة الارتباط بالمصادر</span><b>٩٤٪</b></div>
              <div className="twj-trust-meter__track"><div className="twj-trust-meter__fill" /></div>
            </div>
          </section>

          <section className="twj-trust-card">
            <div className="twj-trust-card__heading">
              <div>
                <span className="twj-kicker">المراجع المستخدمة</span>
                <h3>من أين جاء هذا؟</h3>
              </div>
              <BookOpen className="twj-teal-icon" size={18} aria-hidden="true" />
            </div>
            <p>مصادر جزائرية موثوقة، ظاهرة أمامك بدل أن تبقى خلف النظام.</p>
            {sourcesOpen && (
              <ul className="twj-source-list">
                {sources.map((source) => (
                  <li key={source.page}>
                    <span className="twj-source-list__page">{source.page}</span>
                    <span><strong>{source.title}</strong><small>{source.meta}</small></span>
                  </li>
                ))}
              </ul>
            )}
            <button className="twj-source-toggle" type="button" onClick={() => setSourcesOpen((open) => !open)}>
              {sourcesOpen ? "إخفاء تفاصيل المصادر" : "عرض تفاصيل المصادر"}
            </button>
          </section>

          <section className="twj-generation-card" aria-live="polite">
            <div className="twj-generation-card__row">
              <span className="twj-generation-card__icon">
                {isGenerating ? <RefreshCw size={16} className="twj-spin" /> : <Sparkles size={16} />}
              </span>
              <span>
                <strong>{isGenerating ? "نراجع توزيع الصعوبة..." : "التوليد اكتمل بنجاح"}</strong>
                <small>{isGenerating ? "نصل كل سؤال بعقدته قبل العرض." : "آخر تحديث منذ دقيقة واحدة"}</small>
              </span>
            </div>
            {isGenerating && <div className="twj-loading-skeleton" aria-hidden="true" />}
            {!isGenerating && (
              <button type="button" onClick={regenerate}>
                <FileCheck2 size={13} aria-hidden="true" />
                فحص الروابط مرة أخرى
              </button>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}