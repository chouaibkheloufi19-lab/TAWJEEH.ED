import { type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Compass,
  FileText,
  Flame,
  LayoutDashboard,
  Library,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Play,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Target,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetDashboardQueryKey,
  getListKnowledgeQueryKey,
  getListQuizzesQueryKey,
  useGetDashboard,
  useListKnowledge,
  useListQuizzes,
  useQueryKnowledge,
  useSubmitQuizAttempt,
  type Dashboard,
  type KnowledgeCard,
  type Quiz,
  type QuizResult,
} from '@workspace/api-client-react';
import { Route, Switch, Link, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import TawjeehHero from '@/components/tawjeeh-hero';
import AuthPage from '@/pages/auth';
import logoPath from '@assets/اللوغو_العالمي_1787910738500.jpg';

const queryClient = new QueryClient();

const navItems = [
  { href: '/dashboard', label: 'مساحتي', icon: LayoutDashboard },
  { href: '/knowledge', label: 'المعرفة', icon: Library },
  { href: '/quizzes', label: 'الاختبارات', icon: BrainCircuit },
  { href: '/chat', label: 'اسأل توجيه', icon: MessageCircle },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
      <img
        src={logoPath}
        alt="بومة توجيه"
        data-testid="img-brand-logo"
        className={compact ? 'h-10 w-10 rounded-xl object-cover object-[50%_30%]' : 'h-11 w-11 rounded-xl object-cover object-[50%_30%]'}
      />
      {!compact && (
        <span className="leading-none">
          <span className="block text-[18px] font-extrabold tracking-[-.04em] text-[#e6f6fb]">TAWJEEH</span>
          <span className="mt-1 block text-[9px] font-bold text-[#b3e5fc]">مساحة التعلّم</span>
        </span>
      )}
    </Link>
  );
}

function AgentAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
  return (
    <img
      src={logoPath}
      alt="بومة توجيه"
      data-testid="img-owl-avatar"
      className={`${dimensions} rounded-[28%] object-cover object-[50%_28%]`}
    />
  );
}

function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const [location] = useLocation();
  return (
    <nav className={mobile ? 'mobile-nav' : 'mt-12 flex flex-col gap-2'} aria-label="التنقل الرئيسي">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? location === '/' : location.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-testid={`link-nav-${label}`}
            className={`${mobile ? '' : 'sidebar-link flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold'} ${active ? 'active' : ''}`}
          >
            <Icon size={mobile ? 19 : 18} strokeWidth={active ? 2.5 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar fixed inset-y-0 right-0 z-10 hidden w-[252px] flex-col px-5 py-7 lg:flex">
      <Logo />
      <NavLinks />
      <div className="mt-auto overflow-hidden rounded-2xl border border-[#b3e5fc] bg-[#004b75] p-4">
        <div className="mb-3 flex items-start justify-between">
          <span className="tag bg-[#e6f6fb] text-[#004b75]">مساحة هادئة</span>
          <Sparkles size={17} className="text-[#e6f6fb]" />
        </div>
        <p className="mb-1 text-sm font-extrabold text-white">كل خطوة تُحسب.</p>
        <p className="text-[11px] leading-5 text-[#b3e5fc]">ارجع إلى خطتك حين تتشتت. بومة توجيه تعرف أين توقفت.</p>
      </div>
      <div className="mt-5 flex items-center justify-between px-1 text-[10px] text-[#b3e5fc]">
        <span>البكالوريا الجزائرية</span>
        <span className="mono">١.٠</span>
      </div>
    </aside>
  );
}

function Topbar({ title }: { title: string }) {
  const [noticeOpen, setNoticeOpen] = useState(false);
  return (
    <header className="mb-7 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div>
          <p className="eyebrow mb-1">الأربعاء، ١٢ جوان ٢٠٢٤</p>
          <h1 className="display text-[23px] md:text-[28px]" data-testid="text-page-title">{title}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
        <button className="icon-button h-10 w-10" onClick={() => setNoticeOpen((open) => !open)} data-testid="button-notifications" aria-label="الإشعارات">
           <span className="relative"><CircleHelp size={18} /><i className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[#2e8b7b]" /></span>
        </button>
        {noticeOpen && <div className="surface absolute left-0 top-12 z-10 w-56 p-3 text-right shadow-lg" data-testid="panel-notifications"><p className="mb-1 text-xs font-extrabold">تذكير صغير</p><p className="text-[11px] leading-5 text-[#71818a]">لديك جلسة مراجعة متبقية في خطة اليوم.</p></div>}
        </div>
        <div className="surface hidden items-center gap-2 px-2 py-1.5 sm:flex">
           <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#e6f6fb] text-xs font-extrabold text-[#005689]">ي</div>
          <span className="pl-1 text-xs font-bold">ياسين</span>
        </div>
      </div>
    </header>
  );
}

function Shell({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="app-shell noise">
      <Sidebar />
      <main className="min-h-[100dvh] lg:mr-[252px]">
        <div className="content-wrap">
          <Topbar title={title} />
          {children}
        </div>
      </main>
      <NavLinks mobile />
    </div>
  );
}

function LoadingState({ label = 'جاري تجهيز مساحتك...' }: { label?: string }) {
  return (
    <div className="space-y-4" data-testid="state-loading">
      <div className="surface h-40 animate-pulse bg-[#e6f6fb]" />
      <div className="grid gap-4 md:grid-cols-3">
         {[1, 2, 3].map((item) => <div className="surface h-28 animate-pulse bg-[#e6f6fb]" key={item} />)}
      </div>
       <p className="text-center text-sm font-semibold text-[#64748b]">{label}</p>
    </div>
  );
}

function ErrorState({ onRetry, label = 'تعذر تحميل هذه المساحة.' }: { onRetry: () => void; label?: string }) {
  return (
    <div className="surface flex flex-col items-center justify-center px-6 py-16 text-center" data-testid="state-error">
       <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f8f5] text-[#2e8b7b]"><RotateCcw size={24} /></div>
      <h2 className="mb-2 text-lg font-extrabold">{label}</h2>
       <p className="mb-5 max-w-sm text-sm leading-6 text-[#64748b]">تحقق من الاتصال وحاول مرة أخرى. خطتك محفوظة عندما تعود.</p>
      <button className="primary-button" onClick={onRetry} data-testid="button-retry">حاول مرة أخرى</button>
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center justify-center px-6 py-16 text-center" data-testid="state-empty">
       <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f8f5] text-[#2e8b7b]"><FileText size={25} /></div>
      <h2 className="mb-2 text-lg font-extrabold">{title}</h2>
       <p className="mb-5 max-w-sm text-sm leading-6 text-[#64748b]">{body}</p>
      {action}
    </div>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  const palette: Record<string, string> = { sky: 'bg-[#e6f6fb] text-[#005689]', gold: 'bg-[#e8f8f5] text-[#2e8b7b]', coral: 'bg-[#e6f6fb] text-[#005689]' };
  return (
    <div className="surface fade-up p-5" data-testid={`card-metric-${label}`}>
      <div className="mb-5 flex items-start justify-between gap-2">
         <span className="text-xs font-bold text-[#64748b]">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${palette[tone] ?? palette.sky}`}>
          {tone === 'gold' ? <Flame size={16} /> : tone === 'coral' ? <Target size={16} /> : <Zap size={16} />}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <strong className="display text-[28px]" data-testid={`text-metric-value-${label}`}>{value}</strong>
         <span className="pb-1 text-[11px] font-semibold text-[#64748b]">{detail}</span>
      </div>
    </div>
  );
}

function DashboardPage() {
  const dashboardQuery = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const dashboard = dashboardQuery.data as Dashboard | undefined;
  const [completed, setCompleted] = useState<string[]>([]);
  const [startedId, setStartedId] = useState<string | null>(null);

  if (dashboardQuery.isLoading) return <Shell title="مساحتي"><LoadingState /></Shell>;
  if (dashboardQuery.isError) return <Shell title="مساحتي"><ErrorState onRetry={() => dashboardQuery.refetch()} /></Shell>;
  if (!dashboard) return <Shell title="مساحتي"><EmptyState title="لم تصل خطتك بعد" body="ستظهر هنا أولويات يومك بمجرد تجهيز مساحة الدراسة." /></Shell>;

  const today = dashboard.today ?? [];
  const metrics = dashboard.metrics ?? [];
  const mastery = dashboard.mastery ?? [];
  const profile = dashboard.profile;

  return (
    <Shell title={`صباح الخير، ${profile?.name ?? 'ياسين'}`}>
      <section className="hero-grid mb-5 grid grid-cols-[1.55fr_.9fr] gap-5">
        <div className="relative overflow-hidden rounded-[1.35rem] bg-[#004b75] px-6 py-7 text-white shadow-[0_16px_38px_rgba(0,86,137,.16)] md:px-8">
          <div className="absolute -left-10 -top-16 h-44 w-44 rounded-full border-[22px] border-[#b3e5fc] opacity-40" />
          <div className="absolute bottom-[-60px] right-[-28px] h-44 w-44 rounded-full border-[24px] border-[#b3e5fc] opacity-50" />
          <div className="relative z-[1] flex items-start justify-between gap-4">
            <div className="max-w-[500px]">
              <div className="mb-4 flex items-center gap-3"><AgentAvatar size="sm" /><span className="text-xs font-bold text-[#b3e5fc]">بومة توجيه معك اليوم</span></div>
              <h2 className="display mb-3 text-[27px] md:text-[34px]" data-testid="text-dashboard-focus">{dashboard.focus || 'نحو فهمٍ أعمق، خطوة واحدة كل مرة.'}</h2>
              <p className="mb-6 max-w-md text-sm leading-7 text-[#e6f6fb]">خطة صغيرة وواضحة الآن أفضل من ساعات طويلة مشتتة. لنبدأ من حيث أنت.</p>
              <Link href="/chat" className="primary-button bg-[#e6f6fb] text-[#005689]" data-testid="link-ask-owl"><MessageCircle size={16} /> اسأل بومة توجيه</Link>
            </div>
            <div className="focus-ring hidden h-[112px] w-[112px] shrink-0 sm:grid">
               <div className="text-center"><strong className="mono block text-[24px] text-white">72%</strong><span className="text-[10px] text-[#b3e5fc]">تركيز اليوم</span></div>
            </div>
          </div>
        </div>
        <div className="surface flex flex-col justify-between p-6">
           <div className="flex items-start justify-between"><span className="eyebrow">مؤشر المسار</span><Compass size={20} className="text-[#005689]" /></div>
          <div>
             <p className="mb-2 mt-7 text-sm font-bold text-[#64748b]">ثباتك هذا الأسبوع</p>
            <div className="mb-3 progress-track"><div className="progress-fill" style={{ width: '68%' }} /></div>
             <div className="flex items-end justify-between"><strong className="display text-[26px]">متقدم</strong><span className="text-xs font-semibold text-[#64748b]">٤ من ٦ أيام</span></div>
          </div>
           <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#2e8b7b]"><CheckCircle2 size={16} /> بقيت لك جلسة واحدة لتغلق يومك</div>
        </div>
      </section>

      <section className="mb-7 grid grid-cols-3 gap-4 three-col">
        {metrics.length ? metrics.slice(0, 3).map((metric) => <MetricCard key={metric.label} {...metric} />) : (
          <>
            <MetricCard label="وقت التعلّم" value="٤٥ د" detail="اليوم" tone="sky" />
            <MetricCard label="سلسلة الالتزام" value={`${profile?.streak ?? 0} أيام`} detail="استمر" tone="gold" />
            <MetricCard label="أسئلة أُتقنت" value="١٢" detail="هذا الأسبوع" tone="coral" />
          </>
        )}
      </section>

      <section className="grid grid-cols-[1.35fr_.8fr] gap-5 two-col">
        <div className="surface p-5 md:p-6">
          <div className="mb-5 flex items-end justify-between">
            <div><p className="eyebrow mb-1">خريطة اليوم</p><h2 className="display text-xl">خطتك الدراسية</h2></div>
             <span className="rounded-full bg-[#e8f8f5] px-3 py-1.5 text-[11px] font-bold text-[#2e8b7b]">{today.length} جلسات</span>
          </div>
          <div className="space-y-2">
            {today.length === 0 ? <EmptyState title="يوم هادئ" body="لا توجد جلسات مقررة اليوم. استعمل المعرفة لمراجعة موضوع تحبه." /> : today.map((block, index) => {
              const isComplete = block.completed || completed.includes(block.id);
              return (
                <div key={block.id} className={`group flex items-center gap-3 rounded-2xl border p-3 transition-colors ${isComplete ? 'border-[#b3e5fc] bg-[#e8f8f5]' : startedId === block.id ? 'border-[#b3e5fc] bg-[#e6f6fb]' : 'border-transparent bg-[#f7fcfe] hover:border-[#b3e5fc]'}`} data-testid={`row-study-block-${block.id}`}>
                  <div className="w-14 shrink-0 text-center"><span className="mono block text-xs font-bold text-[#005689]">{block.time}</span><span className="text-[10px] text-[#64748b]">{block.duration}</span></div>
                  <div className="h-10 w-px bg-[#b3e5fc]" />
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${index % 2 ? 'bg-[#e8f8f5] text-[#2e8b7b]' : 'bg-[#e6f6fb] text-[#005689]'}`}><BookOpen size={18} /></div>
                  <div className="min-w-0 flex-1"><p className={`truncate text-sm font-extrabold ${isComplete ? 'text-[#64748b] line-through' : ''}`}>{block.title}</p><p className="mt-0.5 text-[11px] text-[#64748b]">{block.subject} · {block.kind}</p></div>
                  {isComplete ? <CheckCircle2 className="text-[#2e8b7b]" size={20} /> : (
                    <button className="secondary-button !rounded-lg !px-3 !py-2 !text-[11px]" onClick={() => { setStartedId(block.id); setCompleted((current) => [...current, block.id]); }} data-testid={`button-complete-${block.id}`}>{startedId === block.id ? 'أحسنت' : 'ابدأ'}</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-5">
          <div className="surface p-5">
             <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow mb-1">لمحة سريعة</p><h2 className="display text-lg">مستوى الإتقان</h2></div><Trophy size={20} className="text-[#005689]" /></div>
            <div className="space-y-4">
               {mastery.length === 0 ? <p className="text-sm text-[#64748b]">ستظهر المواد التي راجعتها هنا.</p> : mastery.slice(0, 3).map((item) => (
                <div key={item.subject} data-testid={`row-mastery-${item.subject}`}>
                   <div className="mb-1.5 flex justify-between text-xs font-bold"><span>{item.subject}</span><span className="mono text-[#005689]">{item.percent}%</span></div>
                   <div className="progress-track"><div className="progress-fill" style={{ width: `${item.percent}%`, background: '#005689' }} /></div>
                   <p className="mt-1 text-[10px] text-[#64748b]">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
           <div className="surface-soft bg-[#e8f8f5] p-5">
             <div className="mb-3 flex items-center gap-2 text-[#2e8b7b]"><Sparkles size={17} /><span className="text-xs font-extrabold">اقتراح بومة توجيه</span></div>
            <p className="text-sm font-bold leading-7">راجع مفهومًا واحدًا من الفيزياء قبل أن تنهي اليوم.</p>
             <Link href="/knowledge" className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[#005689]" data-testid="link-discover-knowledge">اكتشف ملخصاتك <ArrowLeft size={14} /></Link>
          </div>
        </div>
      </section>
    </Shell>
  );
}

function KnowledgeCardView({ card }: { card: KnowledgeCard }) {
  return (
      <article className="surface border-[#b3e5fc] p-5 transition-transform hover:-translate-y-0.5" data-testid={`card-knowledge-${card.id}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
         <span className="tag bg-[#e8f8f5] text-[#2e8b7b]">{card.subject}</span>
         <span className="text-[11px] font-semibold text-[#64748b]">{card.type}</span>
      </div>
      <h3 className="mb-2 text-[16px] font-extrabold leading-7">{card.title}</h3>
       <p className="mb-4 line-clamp-3 text-sm leading-7 text-[#64748b]">{card.summary}</p>
       <div className="flex flex-wrap gap-1.5">{(card.tags ?? []).slice(0, 3).map((tag) => <span className="tag bg-[#f7fcfe] text-[#64748b]" key={tag}>#{tag}</span>)}</div>
       <div className="mt-5 flex items-center justify-between border-t border-[#b3e5fc] pt-3 text-[11px] text-[#64748b]"><span>{card.unit} · {card.lesson}</span><span className="font-semibold">{card.source} · ص {card.page}</span></div>
    </article>
  );
}

function KnowledgePage() {
  const [subject, setSubject] = useState('');
  const [term, setTerm] = useState('');
  const [searched, setSearched] = useState('');
  const knowledgeParams = useMemo(() => subject ? { subject } : undefined, [subject]);
  const knowledgeQuery = useListKnowledge(knowledgeParams, { query: { queryKey: getListKnowledgeQueryKey(knowledgeParams) } });
  const searchMutation = useQueryKnowledge();
  const baseCards = (knowledgeQuery.data as KnowledgeCard[] | undefined) ?? [];
  const resultCards = searchMutation.data?.results ?? (searched ? [] : baseCards);
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (term.trim().length < 2) return;
    const query = term.trim();
    setSearched(query);
    searchMutation.mutate({ data: { query, n_results: 8, subject: subject || undefined } });
  };

  return (
    <Shell title="مكتبة المعرفة">
       <section className="surface mb-5 overflow-hidden border-[#2e8b7b] bg-[#e8f8f5] p-6 md:p-8">
        <div className="grid grid-cols-[1fr_auto] items-center gap-5">
           <div><p className="eyebrow mb-2">معرفة موثوقة، بوضوح</p><h2 className="display max-w-xl text-[26px] md:text-[34px]">ابحث عن الفكرة، لا عن الصفحة.</h2><p className="mt-3 max-w-lg text-sm leading-7 text-[#64748b]">ملخصات مستخرجة من مصادر المنهاج الجزائري، مع إحالة واضحة تساعدك على العودة إلى الأصل.</p></div>
           <div className="hidden h-20 w-20 place-items-center rounded-[30px] bg-[#e6f6fb] text-[#005689] sm:grid"><Search size={31} strokeWidth={1.5} /></div>
        </div>
        <form className="mt-7 flex gap-2" onSubmit={submitSearch}>
           <div className="relative flex-1"><Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748b]" /><input value={term} onChange={(event) => setTerm(event.target.value)} className="h-12 w-full rounded-xl border border-[#b3e5fc] bg-white pr-11 text-sm outline-none transition focus:border-[#005689] focus:ring-2 focus:ring-[#b3e5fc]" placeholder="مثال: قوانين نيوتن، الاستعمار..." data-testid="input-knowledge-search" /></div>
          <button className="primary-button h-12 px-5" disabled={searchMutation.isPending || term.trim().length < 2} data-testid="button-knowledge-search"><Search size={16} /> <span className="hide-mobile">ابحث</span></button>
        </form>
      </section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
         <div className="flex items-center gap-2"><button onClick={() => { setSubject(''); setSearched(''); }} className={`tag border px-4 py-2 ${!subject ? 'border-[#2e8b7b] bg-[#e8f8f5] text-[#2e8b7b]' : 'border-transparent bg-[#f7fcfe] text-[#64748b]'}`} data-testid="button-filter-all">كل المواد</button>{['الرياضيات', 'الفيزياء', 'العلوم'].map((item) => <button key={item} onClick={() => { setSubject(item); setSearched(''); }} className={`tag border px-4 py-2 ${subject === item ? 'border-[#2e8b7b] bg-[#e8f8f5] text-[#2e8b7b]' : 'border-transparent bg-[#f7fcfe] text-[#64748b]'}`} data-testid={`button-filter-${item}`}>{item}</button>)}</div>
         <span className="text-xs font-semibold text-[#64748b]" data-testid="text-knowledge-count">{searched ? `${searchMutation.data?.count ?? 0} نتائج عن «${searched}»` : `${baseCards.length} ملخصات مقترحة`}</span>
      </div>
      {knowledgeQuery.isLoading || searchMutation.isPending ? <LoadingState label="نفتش في دفترك..." /> : knowledgeQuery.isError ? <ErrorState onRetry={() => knowledgeQuery.refetch()} /> : resultCards.length === 0 ? <EmptyState title={searched ? 'لم نعثر على هذه الفكرة' : 'المكتبة تستعد'} body={searched ? 'جرّب كلمات أقصر أو اسم درس مختلف. أحيانًا تكون الفكرة تحت عنوان آخر.' : 'ستظهر الملخصات المصدرية هنا قريبًا.'} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{resultCards.map((card) => <KnowledgeCardView card={card} key={card.id} />)}</div>}
    </Shell>
  );
}

function QuizResultCard({ result, onAgain }: { result: QuizResult; onAgain: () => void }) {
  const percentage = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  return (
    <div className="surface mx-auto max-w-xl p-8 text-center" data-testid="card-quiz-result">
       <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] bg-[#e6f6fb] text-[#005689]"><Trophy size={37} strokeWidth={1.5} /></div>
      <p className="eyebrow mb-2">اكتملت المحاولة</p><h2 className="display mb-2 text-3xl">{result.message || 'عمل جميل، واصل التقدم.'}</h2>
       <p className="mb-7 text-sm text-[#64748b]">هذه النتيجة نقطة بداية ذكية لجلسة المراجعة القادمة.</p>
       <div className="mb-7 grid grid-cols-3 divide-x divide-x-reverse divide-[#b3e5fc] rounded-2xl bg-[#e6f6fb] p-4">
         <div><strong className="mono block text-2xl text-[#005689]">{percentage}%</strong><span className="text-[10px] font-bold text-[#64748b]">النتيجة</span></div>
         <div><strong className="mono block text-2xl text-[#2e8b7b]">{result.correct}</strong><span className="text-[10px] font-bold text-[#64748b]">صحيح</span></div>
         <div><strong className="mono block text-2xl text-[#005689]">{result.points_earned}</strong><span className="text-[10px] font-bold text-[#64748b]">نقطة</span></div>
      </div>
      <button className="primary-button" onClick={onAgain} data-testid="button-quiz-again"><RotateCcw size={16} /> العودة للاختبارات</button>
    </div>
  );
}

function QuizAttempt({ quiz, onExit }: { quiz: Quiz; onExit: () => void }) {
  const submitMutation = useSubmitQuizAttempt();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const question = quiz.questions?.[questionIndex];
  if (result) return <QuizResultCard result={result} onAgain={onExit} />;
  if (!question) return <EmptyState title="لا توجد أسئلة" body="هذا الاختبار لا يحتوي على أسئلة قابلة للعرض حاليًا." action={<button className="secondary-button" onClick={onExit} data-testid="button-exit-empty-quiz">العودة</button>} />;
  const isLast = questionIndex === quiz.questions.length - 1;
  const choose = (option: string) => setAnswers((current) => ({ ...current, [question.id]: option }));
  const submit = () => submitMutation.mutate({ quizId: quiz.id, data: { answers } }, { onSuccess: (data) => setResult(data) });
  return (
    <div className="mx-auto max-w-3xl">
       <div className="mb-5 flex items-center justify-between"><button className="secondary-button !px-3 !py-2 !text-xs" onClick={onExit} data-testid="button-exit-quiz"><X size={15} /> إنهاء</button><span className="text-xs font-bold text-[#64748b]">{quiz.title}</span></div>
      <div className="surface mb-4 p-5 md:p-8">
         <div className="mb-7 flex items-center justify-between"><span className="tag bg-[#e6f6fb] text-[#005689]">السؤال {questionIndex + 1} من {quiz.questions.length}</span><span className="mono text-xs text-[#64748b]">{quiz.duration}</span></div>
        <div className="mb-8 progress-track"><div className="progress-fill" style={{ width: `${((questionIndex + 1) / quiz.questions.length) * 100}%` }} /></div>
        <h2 className="mb-7 text-xl font-extrabold leading-9" data-testid={`text-question-${question.id}`}>{question.prompt}</h2>
         <div className="space-y-3">{question.options.map((option, index) => { const selected = answers[question.id] === option; return <button key={option} onClick={() => choose(option)} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-right text-sm font-bold transition ${selected ? 'border-[#2e8b7b] bg-[#e8f8f5] text-[#005689]' : 'border-[#b3e5fc] bg-white hover:border-[#2e8b7b]'}`} data-testid={`button-answer-${question.id}-${index}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs ${selected ? 'bg-[#2e8b7b] text-white' : 'bg-[#e6f6fb] text-[#64748b]'}`}>{selected ? <Check size={15} /> : String.fromCharCode(1575 + index)}</span><span>{option}</span></button>; })}</div>
      </div>
      <div className="flex items-center justify-between"><button className="secondary-button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((index) => index - 1)} data-testid="button-previous-question"><ArrowRight size={16} /> السابق</button>{isLast ? <button className="primary-button" disabled={!answers[question.id] || submitMutation.isPending} onClick={submit} data-testid="button-submit-quiz">{submitMutation.isPending ? 'جارٍ التصحيح...' : 'أرسل الإجابات'} <CheckCircle2 size={16} /></button> : <button className="primary-button" disabled={!answers[question.id]} onClick={() => setQuestionIndex((index) => index + 1)} data-testid="button-next-question">التالي <ArrowLeft size={16} /></button>}</div>
       {submitMutation.isError && <p className="mt-4 text-center text-sm font-bold text-[#2e8b7b]" data-testid="status-quiz-error">تعذر إرسال الإجابات. حاول مرة أخرى.</p>}
    </div>
  );
}

function QuizCard({ quiz, onStart }: { quiz: Quiz; onStart: () => void }) {
  return (
    <article className="surface flex flex-col p-5" data-testid={`card-quiz-${quiz.id}`}>
       <div className="mb-5 flex items-start justify-between"><span className="tag bg-[#e8f8f5] text-[#2e8b7b]">{quiz.subject}</span><span className="text-[11px] font-bold text-[#64748b]">{quiz.status}</span></div>
       <h3 className="mb-2 text-lg font-extrabold">{quiz.title}</h3><p className="mb-6 min-h-[48px] text-sm leading-7 text-[#64748b]">{quiz.description}</p>
       <div className="mb-5 flex items-center gap-4 text-[11px] font-bold text-[#64748b]"><span className="flex items-center gap-1"><Clock3 size={14} /> {quiz.duration}</span><span className="flex items-center gap-1"><CircleHelp size={14} /> {quiz.questions?.length ?? 0} أسئلة</span><span className="flex items-center gap-1"><Zap size={14} /> {quiz.points} نقطة</span></div>
      <button className="primary-button mt-auto w-full" onClick={onStart} data-testid={`button-start-quiz-${quiz.id}`}><Play size={15} fill="currentColor" /> ابدأ التدريب</button>
    </article>
  );
}

function QuizzesPage() {
  const quizzesQuery = useListQuizzes({ query: { queryKey: getListQuizzesQueryKey() } });
  const quizzes = (quizzesQuery.data as Quiz[] | undefined) ?? [];
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  if (selectedQuiz) return <Shell title="جلسة تدريب"><QuizAttempt quiz={selectedQuiz} onExit={() => setSelectedQuiz(null)} /></Shell>;
  return (
    <Shell title="الاختبارات والتدريب">
       <section className="mb-5 flex items-end justify-between gap-4 rounded-[1.35rem] border border-[#2e8b7b] bg-[#e8f8f5] p-6 md:p-8">
         <div><p className="eyebrow mb-2 text-[#2e8b7b]">تعلّم من إجابتك</p><h2 className="display text-[26px] md:text-[34px]">اختبر فهمك، بهدوء.</h2><p className="mt-3 max-w-xl text-sm leading-7 text-[#64748b]">اختبارات قصيرة تتبع ما تدرسه، وتترك لك إشارة واضحة لما يستحق جلسة أخرى.</p></div>
         <div className="hidden rounded-2xl bg-[#e6f6fb] p-4 text-[#005689] sm:block"><Target size={32} strokeWidth={1.5} /></div>
      </section>
      {quizzesQuery.isLoading ? <LoadingState label="نحضّر تمارين مناسبة لك..." /> : quizzesQuery.isError ? <ErrorState onRetry={() => quizzesQuery.refetch()} /> : quizzes.length === 0 ? <EmptyState title="لا توجد اختبارات بعد" body="ستجد هنا تدريبات الوحدات والاختبار الأسبوعي عند توفرها." /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{quizzes.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} onStart={() => setSelectedQuiz(quiz)} />)}</div>}
    </Shell>
  );
}

type ChatMessage = { id: number; from: 'student' | 'agent'; text: string };
const agentOptions = [
  { id: 'host', name: 'بومة توجيه', role: 'المضيف' },
  { id: 'fahim', name: 'فَهيم', role: 'تشخيص الفجوات' },
  { id: 'dalil', name: 'دليل', role: 'شرح المفاهيم' },
];
const starterMessages: ChatMessage[] = [{ id: 1, from: 'agent', text: 'أهلًا ياسين. أنا بومة توجيه، وسأوصلك إلى المساعدة المناسبة. ماذا يشغل بالك الآن؟' }];

function ChatPage() {
  const [agent, setAgent] = useState('host');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const selectedAgent = agentOptions.find((item) => item.id === agent) ?? agentOptions[0];
  const send = (value = text) => {
    const clean = value.trim();
    if (!clean) return;
    setMessages((current) => [...current, { id: Date.now(), from: 'student', text: clean }, { id: Date.now() + 1, from: 'agent', text: agent === 'fahim' ? 'لنحددها معًا. اكتب ما تعرفه عن الفكرة، وسأكشف لك الجزء الذي يحتاج مراجعة.' : agent === 'dalil' ? 'سأشرحها لك خطوة خطوة وبأمثلة من المنهاج. ما المصطلح الذي تريد تبسيطه؟' : 'فكرة جيدة. يمكنني توجيهك إلى ملخص مناسب أو تدريب قصير. من أي مادة نبدأ؟' }]);
    setText('');
  };
  return (
    <Shell title="اسأل توجيه">
      <div className="grid grid-cols-[.75fr_1.5fr] gap-5 two-col">
         <aside className="surface order-2 border-[#b3e5fc] p-5 lg:order-1">
          <p className="eyebrow mb-1">اختر رفيقك</p><h2 className="display mb-5 text-xl">المساعدة المناسبة</h2>
           <div className="space-y-2">{agentOptions.map((item) => { const active = item.id === agent; return <button key={item.id} onClick={() => setAgent(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition ${active ? 'border-[#2e8b7b] bg-[#e8f8f5]' : 'border-transparent bg-[#f7fcfe] hover:border-[#b3e5fc]'}`} data-testid={`button-agent-${item.id}`}>{item.id === 'host' ? <AgentAvatar size="sm" /> : <span className={`grid h-11 w-11 place-items-center rounded-[26%] ${active ? 'bg-[#e6f6fb] text-[#005689]' : 'bg-[#f7fcfe] text-[#64748b]'}`}>{item.id === 'fahim' ? <BrainCircuit size={20} /> : <BookOpen size={20} />}</span>}<span><strong className="block text-sm font-extrabold">{item.name}</strong><small className="mt-0.5 block text-[10px] text-[#64748b]">{item.role}</small></span>{active && <CheckCircle2 className="mr-auto text-[#2e8b7b]" size={17} />}</button>; })}</div>
           <div className="mt-5 rounded-2xl bg-[#e8f8f5] p-4"><div className="mb-2 flex items-center gap-2 text-[#005689]"><Sparkles size={15} /><span className="text-xs font-extrabold">اقتراح سريع</span></div><p className="text-xs font-bold leading-6 text-[#64748b]">لا تعرف من تختار؟ ابدأ ببومة توجيه وسنجد الطريق معًا.</p></div>
        </aside>
        <section className="surface order-1 flex min-h-[570px] flex-col overflow-hidden lg:order-2">
           <div className="flex items-center gap-3 border-b border-[#b3e5fc] bg-[#f7fcfe] px-5 py-4"><div className="relative">{selectedAgent.id === 'host' ? <AgentAvatar size="sm" /> : <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e6f6fb] text-[#005689]">{selectedAgent.id === 'fahim' ? <BrainCircuit size={17} /> : <BookOpen size={17} />}</span>}<i className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#f7fcfe] bg-[#2e8b7b]" /></div><div><strong className="block text-sm font-extrabold">{selectedAgent.name}</strong><span className="text-[10px] text-[#64748b]">{selectedAgent.role} · متصل الآن</span></div><MoreHorizontal className="mr-auto text-[#64748b]" size={19} /></div>
           <div className="flex-1 space-y-4 overflow-y-auto p-5 md:p-7">{messages.map((message) => <div key={message.id} className={`flex items-end gap-2 ${message.from === 'student' ? 'justify-start' : 'justify-end'}`} data-testid={`message-chat-${message.id}`}>{message.from === 'agent' && <AgentAvatar size="sm" />}<div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-7 ${message.from === 'student' ? 'rounded-bl-md bg-[#004b75] text-white' : 'rounded-br-md bg-[#e8f8f5] text-[#005689]'}`}>{message.text}</div></div>)}</div>
           <div className="border-t border-[#b3e5fc] p-4"><div className="mb-3 flex flex-wrap gap-2">{['اشرح لي درسًا', 'اختبرني قليلًا', 'أين أخطئ؟'].map((prompt) => <button key={prompt} onClick={() => send(prompt)} className="tag bg-[#f7fcfe] text-[#64748b] transition hover:bg-[#e6f6fb]" data-testid={`button-prompt-${prompt}`}>{prompt}</button>)}</div><form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); send(); }}><button type="button" className="icon-button h-11 w-11 shrink-0" onClick={() => setText((current) => current || 'أريد إرفاق ملفًا')} data-testid="button-attach" aria-label="إرفاق ملف"><Paperclip size={18} /></button><textarea rows={1} value={text} onChange={(event) => setText(event.target.value)} className="min-h-11 flex-1 resize-none rounded-xl border border-[#b3e5fc] bg-white px-4 py-3 text-sm outline-none focus:border-[#005689]" placeholder="اكتب سؤالك هنا..." data-testid="input-chat-message" /><button className="primary-button h-11 w-11 shrink-0 !p-0" type="submit" disabled={!text.trim()} data-testid="button-send-message" aria-label="إرسال الرسالة"><Send size={17} /></button></form><p className="mt-2 text-center text-[10px] text-[#64748b]">توجيه يساعدك على الفهم، وأنت صاحب القرار في رحلتك.</p></div>
        </section>
      </div>
    </Shell>
  );
}

function NotFoundArabic() {
   return <div className="app-shell flex min-h-[100dvh] items-center justify-center p-6"><div className="surface max-w-md p-9 text-center"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#e8f8f5] text-[#2e8b7b]"><Compass size={28} /></div><h1 className="display mb-3 text-2xl">هذه الصفحة خارج الخريطة</h1><p className="mb-6 text-sm leading-7 text-[#64748b]">لنعد إلى مساحة الدراسة ونكمل من حيث توقفت.</p><Link href="/" className="primary-button" data-testid="link-not-found-home">العودة إلى مساحتي <ArrowLeft size={16} /></Link></div></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={TawjeehHero} /><Route path="/login" component={() => <AuthPage mode="login" />} /><Route path="/register" component={() => <AuthPage mode="register" />} /><Route path="/dashboard" component={DashboardPage} /><Route path="/knowledge" component={KnowledgePage} /><Route path="/quizzes" component={QuizzesPage} /><Route path="/chat" component={ChatPage} /><Route component={NotFoundArabic} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><Router /></QueryClientProvider>;
}

export default App;