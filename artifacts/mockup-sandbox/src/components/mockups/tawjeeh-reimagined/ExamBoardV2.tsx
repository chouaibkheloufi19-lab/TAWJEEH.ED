import { useState } from "react";
import { BookOpen, CheckCircle2, FileCheck2, Printer, RefreshCw, ShieldCheck, Timer } from "lucide-react";
import "./_v2.css";

const sources = [
  { page: "ص ٤٢", title: "الكتاب المدرسي · الدوال العددية", meta: "وزارة التربية الوطنية · طبعة ٢٠٢٤" },
  { page: "ص ٧٨", title: "الاشتقاق وتطبيقاته", meta: "الوحدة الثالثة · مرجع المنهاج" },
  { page: "ص ١١٦", title: "نماذج بكالوريا محلولة", meta: "الديوان الوطني للتعليم والتكوين" },
];

export function ExamBoardV2() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);

  const regenerate = () => {
    setIsGenerating(true);
    window.setTimeout(() => setIsGenerating(false), 1200);
  };

  return (
    <main className="twjv2-root twjv2-exam">
      <header className="twjv2-exam__topbar">
        <div className="twjv2-brand" aria-label="TAWJEEH">
          <span className="twjv2-brand__mark" aria-hidden="true">ت</span>
          <span className="twjv2-brand__copy">
            <strong>TAWJEEH</strong>
            <small>مختبر الاختبارات</small>
          </span>
        </div>
        <div className={`twjv2-exam__status ${isGenerating ? "is-loading" : ""}`} role="status">
          <i aria-hidden="true" />
          {isGenerating ? "نراجع ترتيب الموضوع..." : "الموضوع جاهز للمراجعة"}
        </div>
        <div className="twjv2-exam__top-actions">
          <button className="twjv2-exam__top-action" type="button" onClick={regenerate} disabled={isGenerating}>
            <RefreshCw size={14} aria-hidden="true" />
            إعادة التوليد
          </button>
          <button className="twjv2-exam__top-action twjv2-exam__top-action--solid" type="button" onClick={() => window.print()} disabled={isGenerating}>
            <Printer size={14} aria-hidden="true" />
            طباعة
          </button>
        </div>
      </header>

      <div className="twjv2-exam__layout">
        <section className="twjv2-exam__reading" aria-label="ورقة الاختبار">
          <div className="twjv2-exam__reading-intro">
            <div>
              <span className="twjv2-kicker">ورقة تدريبية · قراءة ومراجعة</span>
              <h1>موضوع الرياضيات،<br />من الفكرة إلى البرهان.</h1>
              <p>أنشأه توجيه من مكتبتك الدراسية؛ اقرأ، حلّ، ثم عد إلى دليل التصحيح لتعرف أين تغيّر اتجاهك.</p>
            </div>
            <span>جلسة ٠٧</span>
          </div>

          <article className="twjv2-paper">
            <header className="twjv2-paper-head">
              <div>
                <p>الجمهورية الجزائرية الديمقراطية الشعبية</p>
                <p>وزارة التربية الوطنية</p>
              </div>
              <div className="twjv2-paper-mark" aria-label="علامة توجيه">ت<span>T</span></div>
              <div>
                <p>موضوع مولّد ومراجع</p>
                <p>السنة الدراسية ٢٠٢٤ / ٢٠٢٥</p>
              </div>
            </header>

            <div className="twjv2-paper-title">
              <span className="twjv2-paper-kicker">الرياضيات · شعبة العلوم التجريبية</span>
              <h2>الدوال العددية والاشتقاق</h2>
              <div className="twjv2-exam__meta">
                <span>السنة الثالثة ثانوي</span>
                <span><Timer size={11} /> ساعتان</span>
                <span>٢٠ نقطة</span>
              </div>
            </div>

            <div className="twjv2-instructions">
              <strong>تعليمات المترشح</strong>
              <ul>
                <li>يُسمح باستعمال الآلة الحاسبة غير المبرمجة.</li>
                <li>برّر كل نتيجة واكتب خطوات الحل بوضوح.</li>
              </ul>
            </div>

            <section className="twjv2-exam-section">
              <div className="twjv2-section-heading">
                <strong>التمرين الأول · قراءة منحنى</strong>
                <span>٠٦ نقاط</span>
              </div>
              <p>لتكن الدالة العددية f المعرفة على المجال ]−∞، +∞[ بتمثيلها البياني الآتي، ولتكن النقطة A فاصلة منحناها ٢.</p>
              <div className="twjv2-math" dir="ltr">f(x) = x² − 4x + 1</div>
              <ol className="twjv2-questions">
                <li className="twjv2-question">احسب العدد f(٢)، ثم عيّن إحداثيي النقطة التي تمثل القيمة الصغرى للدالة. <b>(٢ ن)</b><div className="twjv2-answer-lines" aria-hidden="true"><i /><i /></div></li>
                <li className="twjv2-question">ادرس اتجاه تغير الدالة f على مجال تعريفها وأنشئ جدول تغيراتها. <b>(٤ ن)</b><div className="twjv2-answer-lines" aria-hidden="true"><i /><i /><i /></div></li>
              </ol>
            </section>

            <section className="twjv2-exam-section">
              <div className="twjv2-section-heading">
                <strong>التمرين الثاني · من الاشتقاق إلى القرار</strong>
                <span>٠٨ نقاط</span>
              </div>
              <p>يمثل p(t) عدد الوحدات المنتجة في ورشة صغيرة بعد t ساعات من العمل. نقرّب هذا العدد بالدالة التالية:</p>
              <div className="twjv2-math" dir="ltr">p(t) = −t³ + 9t² + 12t &nbsp;&nbsp; ; &nbsp;&nbsp; 0 ≤ t ≤ 6</div>
              <ol className="twjv2-questions">
                <li className="twjv2-question">احسب p′(t) واستنتج قيمة t التي تجعل الإنتاج في أقصاه. <b>(٤ ن)</b><div className="twjv2-answer-lines" aria-hidden="true"><i /><i /></div></li>
                <li className="twjv2-question">فسّر النتيجة في سياق الورشة، واقترح توقيتًا مناسبًا للتوقف. <b>(٤ ن)</b><div className="twjv2-answer-lines" aria-hidden="true"><i /></div></li>
              </ol>
            </section>

            <div className={`twjv2-correction ${isGenerating ? "is-refreshing" : ""}`} data-testid="correction-guide">
              <div className="twjv2-correction-heading">
                <div>
                  <span className="twjv2-paper-kicker">دليل التصحيح · قابل للتتبع</span>
                  <h2>لا تحفظ النتيجة. افهم مسارها.</h2>
                </div>
                <span className="twjv2-correction__stamp"><CheckCircle2 size={14} /> موثّق بالمصادر</span>
              </div>
              <p className="twjv2-correction-intro">هذا الدليل يشرح أين تُحتسب العلامة، وما الفكرة التي ينبغي أن تظهر في ورقتك؛ لا يكتفي بعرض الحل النهائي.</p>

              <article className="twjv2-correction-section">
                <div className="twjv2-correction-section-heading">
                  <strong>التمرين الأول · السؤال ٢</strong>
                  <span>٠٤ نقاط</span>
                </div>
                <ol>
                  <li>نحسب المشتقة: f′(x) = ٢x − ٤.</li>
                  <li>نحل f′(x) = ٠ فنجد x = ٢، ثم ندرس إشارة المشتقة.</li>
                  <li>نستنتج أن الدالة تتناقص ثم تتزايد، ومنه قيمة صغرى عند x = ٢.</li>
                </ol>
                <div className="twjv2-criteria">
                  <span><b>١ ن</b> حساب المشتقة</span>
                  <span><b>٢ ن</b> جدول الإشارة</span>
                  <span><b>١ ن</b> تفسير النتيجة</span>
                </div>
              </article>

              <article className="twjv2-correction-section">
                <div className="twjv2-correction-section-heading">
                  <strong>التمرين الثاني · السؤال ١</strong>
                  <span>٠٤ نقاط</span>
                </div>
                <ol>
                  <li>نستعمل قاعدة اشتقاق مجموع الحدود لنحصل على p′(t) = −٣t² + ١٨t + ١٢.</li>
                  <li>نحدد إشارة p′ على المجال، ثم نربطها بتغير عدد الوحدات.</li>
                </ol>
                <div className="twjv2-criteria">
                  <span><b>٢ ن</b> الاشتقاق</span>
                  <span><b>٢ ن</b> الاستنتاج</span>
                </div>
              </article>

              <footer className="twjv2-paper-footer">
                <span>٣ عقد معرفية مسترجعة · ٩٤٪ تطابق مع المنهاج</span>
                <span>TAWJEEH / CORRECTION</span>
              </footer>
            </div>
          </article>
        </section>

        <aside className="twjv2-exam__aside" aria-label="سياق الموضوع ومصادره">
          <section className="twjv2-context-card">
            <div className="twjv2-context-card__heading">
              <div>
                <span className="twjv2-kicker">سلسلة الثقة</span>
                <h3>موضوع يمكن الرجوع إليه</h3>
              </div>
              <span className="twjv2-context-card__icon"><ShieldCheck size={18} aria-hidden="true" /></span>
            </div>
            <p>كل سؤال مرتبط بعقدة من مكتبة المنهاج. لا نعرض نتيجة بلا أصل يمكن أن تعود إليه.</p>
            <div className="twjv2-trust-meter">
              <div className="twjv2-trust-meter__row"><span>قوة الارتباط بالمصادر</span><b>٩٤٪</b></div>
              <div className="twjv2-trust-meter__track"><div className="twjv2-trust-meter__fill" /></div>
            </div>
          </section>

          <section className="twjv2-context-card">
            <div className="twjv2-context-card__heading">
              <div>
                <span className="twjv2-kicker">المراجع المستخدمة</span>
                <h3>من أين جاء هذا؟</h3>
              </div>
              <BookOpen className="twjv2-accent-icon" size={18} aria-hidden="true" />
            </div>
            <p>مصادر جزائرية ظاهرة أمامك، حتى يبقى مسار السؤال مفهومًا من البداية إلى التصحيح.</p>
            {sourcesOpen && (
              <ul className="twjv2-source-list">
                {sources.map((source) => (
                  <li key={source.page}>
                    <span className="twjv2-source-list__page">{source.page}</span>
                    <span><strong>{source.title}</strong><small>{source.meta}</small></span>
                  </li>
                ))}
              </ul>
            )}
            <button className="twjv2-source-toggle" type="button" onClick={() => setSourcesOpen((open) => !open)}>
              {sourcesOpen ? "إخفاء تفاصيل المصادر" : "عرض تفاصيل المصادر"}
            </button>
          </section>

          <section className="twjv2-generation-card" aria-live="polite">
            <div className="twjv2-generation-card__row">
              <span className="twjv2-generation-card__icon">
                {isGenerating ? <RefreshCw size={16} className="twjv2-spin" /> : <FileCheck2 size={16} />}
              </span>
              <span>
                <strong>{isGenerating ? "نراجع توزيع الصعوبة..." : "التوليد اكتمل بنجاح"}</strong>
                <small>{isGenerating ? "نصل كل سؤال بعقدته قبل العرض." : "آخر تحديث منذ دقيقة واحدة"}</small>
              </span>
            </div>
            {isGenerating && <div className="twjv2-loading-skeleton" aria-hidden="true" />}
            {!isGenerating && (
              <button type="button" onClick={regenerate}>
                <RefreshCw size={13} aria-hidden="true" />
                فحص الروابط مرة أخرى
              </button>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}