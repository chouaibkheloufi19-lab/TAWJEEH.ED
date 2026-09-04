import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ClerkProvider,
  Show,
  SignIn,
  SignUp,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Compass,
  FileText,
  Flame,
  LogOut,
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
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetDashboardQueryKey,
  getGetErrorBankQueryKey,
  getGetExamModeQueryKey,
  getGetSummaryBankQueryKey,
  getHealthCheckQueryKey,
  getListKnowledgeQueryKey,
  getListQuizAttemptsQueryKey,
  getListQuizzesQueryKey,
  useGetDashboard,
  useGetErrorBank,
  useGetExamMode,
  useGetSummaryBank,
  useHealthCheck,
  useListKnowledge,
  useListQuizAttempts,
  useListQuizzes,
  useQueryKnowledge,
  useSubmitQuizAttempt,
  type Dashboard,
  type ErrorBankItem,
  type ExamMode,
  type KnowledgeCard,
  type Quiz,
  type QuizAttemptRecord,
  type QuizResult,
  type SummaryBankItem,
} from '@workspace/api-client-react';
import { Redirect, Route, Router as WouterRouter, Switch, Link, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { LessonWorkspace } from '@/components/lesson-workspace';
import { MathPractice } from '@/components/math-practice';
import { PhaseOnePresentation, type PlannerIntakeValues } from '@/components/phase-one';
import { ProgramAgent } from '@/components/program-agent';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';
import owlAgentMint from '@assets/agent-guiding-cropped.png';
import owlAgentTeal from '@assets/agent-creation-cropped.png';
import owlAgentViolet from '@assets/agent-thinking-cropped.png';
import owlAgentGold from '@assets/agent-success-cropped.png';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const examDateKey = 'tawjeeh.exam.baccalaureate-date';
const defaultExamDate = `${new Date().getFullYear() + 1}-06-07`;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment');
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/tawjeeh-logo-transparent.png`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#4f9da4',
    colorForeground: '#f4fbff',
    colorMutedForeground: '#9bb3c2',
    colorBackground: '#102c43',
    colorInput: '#0a2235',
    colorInputForeground: '#f4fbff',
    colorDanger: '#ff8f8f',
    colorNeutral: '#2d5770',
    fontFamily: 'Cairo, sans-serif',
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: '!text-white font-extrabold',
    headerSubtitle: '!text-[#9bb3c2]',
    socialButtonsBlockButtonText: '!text-white font-extrabold',
    formFieldLabel: '!text-[#d9eef5] font-bold',
    footerActionLink: '!text-[#6fe7ee] font-extrabold',
    footerActionText: '!text-[#9bb3c2]',
    dividerText: '!text-[#9bb3c2]',
    identityPreviewEditButton: '!text-[#6fe7ee]',
    formFieldSuccessText: '!text-[#8fe5cd]',
    alertText: '!text-[#ffb0b0]',
    logoBox: 'h-12',
    logoImage: 'max-h-16 w-auto object-contain',
    socialButtonsBlockButton: 'min-h-12 rounded-xl border-[#396b73] !bg-[#153f49] shadow-[0_8px_20px_rgba(0,0,0,.12)] transition-all hover:!border-[#4f9da4] hover:!bg-[#1b5158] hover:!shadow-[0_12px_26px_rgba(0,0,0,.2)]',
    socialButtonsProviderIcon: 'h-5 w-5',
    formButtonPrimary: 'min-h-12 rounded-xl !bg-[#4f9da4] !text-[#082f38] shadow-[0_9px_20px_rgba(79,157,164,.2)] transition-all hover:!bg-[#78b8bb] hover:!shadow-[0_12px_28px_rgba(79,157,164,.3)] font-extrabold',
    formFieldInput: 'min-h-12 rounded-xl border-[#396b73] !bg-[#0a2931] !text-white shadow-none transition-all focus:!border-[#4f9da4] focus:!bg-[#0d353d]',
    footerAction: '!bg-transparent',
    dividerLine: '!bg-[#2d5770]',
    alert: 'border-[#814c59] !bg-[#3a2533]',
    otpCodeFieldInput: 'border-[#2d5770] !bg-[#0a2235] !text-white',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

const navItems = [
  { href: '/profile', label: 'ملف شخصي', icon: UserRound },
  { href: '/program', label: 'البرنامج الدراسي', icon: CalendarDays },
  { href: '/quizzes', label: 'الكويزات الأسبوعية', icon: BrainCircuit },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
      <img
        src={owlLogoPath}
        alt="شعار توجيه"
        data-testid="img-brand-logo"
        className={compact ? 'h-10 w-10 rounded-xl object-contain' : 'h-11 w-11 rounded-xl object-contain'}
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

function AgentAvatar({ size = 'md', pose = 'default' }: { size?: 'sm' | 'md' | 'lg'; pose?: 'default' | 'guiding' | 'success' | 'thinking' | 'mistake' | 'creation' | 'failure' }) {
  const dimensions = size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
  const poseMap = { default: owlAgentMint, guiding: owlAgentTeal, success: owlAgentGold, thinking: owlAgentViolet, mistake: owlAgentViolet, creation: owlAgentGold, failure: owlAgentTeal };
  return (
    <img
      src={poseMap[pose]}
      alt="مساعد توجيه"
      data-testid="img-owl-avatar"
      className={`${dimensions} rounded-[28%] object-contain companion-owl is-${pose}`}
    />
  );
}

function NavLinks({ mobile = false, compact = false }: { mobile?: boolean; compact?: boolean }) {
  const [location] = useLocation();
  return (
    <nav className={mobile ? 'mobile-nav' : `mt-12 flex flex-col gap-2 ${compact ? 'lesson-sidebar-links' : ''}`} aria-label="التنقل الرئيسي">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? location === '/' : location.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-testid={`link-nav-${label}`}
            className={`${mobile ? '' : 'sidebar-link flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold'} ${compact ? 'lesson-sidebar-link' : ''} ${active ? 'active' : ''}`}
          >
            <Icon size={mobile ? 19 : 18} strokeWidth={active ? 2.5 : 1.8} />
            <span className={compact ? 'lesson-sidebar-label' : undefined}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({ compact = false }: { compact?: boolean }) {
  const healthQuery = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const connected = healthQuery.data?.status === 'ok' || healthQuery.data?.status === 'healthy';
  return (
    <aside className={`sidebar fixed inset-y-0 right-0 z-10 hidden w-[252px] flex-col px-5 py-7 lg:flex ${compact ? 'is-compact' : ''}`}>
      <Logo compact={compact} />
      <NavLinks compact={compact} />
      <div className="lesson-sidebar-card mt-auto overflow-hidden rounded-2xl border border-[#b3e5fc] bg-[#004b75] p-4">
        <div className="mb-3 flex items-start justify-between">
          <span className="tag bg-[#e6f6fb] text-[#004b75]">مساحة هادئة</span>
          <Sparkles size={17} className="text-[#e6f6fb]" />
        </div>
        <p className="mb-1 text-sm font-extrabold text-white">كل خطوة تُحسب.</p>
        <p className="text-[11px] leading-5 text-[#b3e5fc]">ارجع إلى خطتك حين تتشتت. النظام يعرف أين توقفت.</p>
      </div>
      <div className="lesson-sidebar-footer mt-5 flex items-center justify-between px-1 text-[10px] text-[#b3e5fc]">
        <span>البكالوريا الجزائرية</span>
        <span className="flex items-center gap-1.5"><i className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#8fe5cd]' : 'bg-[#e7ba8f]'}`} />{connected ? 'متصل' : 'يستعد'}</span>
      </div>
    </aside>
  );
}

function Topbar({ title }: { title: string }) {
  const [noticeOpen, setNoticeOpen] = useState(false);
  const { user } = useUser();
  const displayName = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'الطالب';
  const initials = displayName.slice(0, 1);
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
        {noticeOpen && <div className="surface absolute left-0 top-12 z-10 w-56 p-3 text-right shadow-lg" data-testid="panel-notifications"><p className="mb-1 text-xs font-extrabold">تذكير صغير</p><p className="text-[11px] leading-5 text-[#71818a]">لديك جلسة مراجعة متبقية في خطة العشرة أيام.</p></div>}
        </div>
         <div className="surface hidden items-center gap-2 px-2 py-1.5 sm:flex">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#e6f6fb] text-xs font-extrabold text-[#005689]">{initials}</div>
           <span className="pl-1 text-xs font-bold">{displayName}</span>
        </div>
      </div>
    </header>
  );
}

function Shell({ children, title }: { children: ReactNode; title: string }) {
  const isLessonShell = title === 'جلسة فهيم';
  return (
    <div className={`app-shell noise ${isLessonShell ? 'lesson-shell' : ''}`}>
      <Sidebar compact={isLessonShell} />
      <main className={isLessonShell ? 'min-h-[100dvh] lg:mr-[66px]' : 'min-h-[100dvh] lg:mr-[252px]'}>
        <div className="content-wrap">
          <Topbar title={title} />
          {children}
        </div>
      </main>
      <NavLinks mobile />
    </div>
  );
}

function AuthLoading() {
  return (
    <main className="auth-gate" aria-busy="true">
      <div className="auth-gate-card auth-loading-card">
        <img src={owlLogoPath} alt="" className="auth-gate-logo" />
        <p>جاري تجهيز الدخول إلى توجيه...</p>
      </div>
    </main>
  );
}

function AuthBrand() {
  return (
    <div className="auth-gate-brand">
      <img src={owlLogoPath} alt="شعار توجيه" />
      <div>
        <strong>TAWJEEH</strong>
        <span>مساحة التعلّم</span>
      </div>
    </div>
  );
}

function AuthWelcome() {
  const [, setLocation] = useLocation();
  const savePlannerValues = (values: PlannerIntakeValues) => {
    localStorage.setItem('tawjeeh.phase1.planner.v1', JSON.stringify(values));
    localStorage.setItem('tawjeeh.phase1.entryDate', new Date().toISOString().slice(0, 10));
    setLocation('/sign-up');
  };
  return (
    <PhaseOnePresentation
      onSkip={() => setLocation('/sign-up')}
      onSignIn={() => setLocation('/sign-in')}
      onPlannerSubmit={savePlannerValues}
    />
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  return isSignedIn ? <Redirect to="/profile" /> : <AuthWelcome />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

function ProgramLessonRoute() {
  const canOpenLesson = typeof sessionStorage !== 'undefined'
    && sessionStorage.getItem('tawjeeh.program.lesson-access.v1') === '1';
  if (!canOpenLesson) return <Redirect to="/program" />;
  return <Shell title="جلسة فهيم"><LessonWorkspace /></Shell>;
}

function AuthStory({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
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
        <span className="auth-story-eyebrow">{isRegister ? 'خطوتك الأولى نحو الوضوح' : 'مرحبًا بعودتك إلى مساحتك'}</span>
        <h1>{isRegister ? 'تعلّم أهدأ، تقدّم أوضح.' : 'أهلًا بك من جديد.'}</h1>
        <p>{isRegister ? 'أنشئ حسابك، وسنرتّب لك بداية تشبه مستواك وهدفك.' : 'خطتك، ملخصاتك، ومساعدتك الذكية بانتظارك.'}</p>
      </div>
      <div className="auth-story-trust">
        <span><CheckCircle2 size={16} /> أدواتك التعليمية في مكان واحد</span>
        <span><CheckCircle2 size={16} /> تقدّم محفوظ في كل جلسة</span>
      </div>
    </section>
  );
}

function AuthPageFrame({
  mode,
  children,
}: {
  mode: 'login' | 'register';
  children: ReactNode;
}) {
  const isRegister = mode === 'register';
  return (
    <main className="clerk-auth-page" dir="rtl">
      <AuthStory mode={mode} />
      <section className="clerk-auth-form-column" aria-label={isRegister ? 'إنشاء حساب' : 'تسجيل الدخول'}>
        <div className="clerk-auth-heading">
          <span className="auth-form-kicker">{isRegister ? 'حساب طالب جديد' : 'دخول آمن وبسيط'}</span>
          <h2>{isRegister ? 'أنشئ حسابك الدراسي' : 'سجّل دخولك إلى مساحتك'}</h2>
          <p>{isRegister ? 'ابدأ بتفاصيل بسيطة، ودع توجيه يهيّئ لك تجربة أكثر ملاءمة.' : 'واصل من حيث توقفت، بخطوة واضحة واحدة.'}</p>
        </div>
        {children}
      </section>
    </main>
  );
}

function SignInPage() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <Redirect to="/profile" />;
  return (
    <AuthPageFrame mode="login">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </AuthPageFrame>
  );
}

function SignUpPage() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <Redirect to="/profile" />;
  return (
    <AuthPageFrame mode="register">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </AuthPageFrame>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener]);
  return null;
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

function DashboardPage() {
  const dashboardQuery = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const dashboard = dashboardQuery.data as Dashboard | undefined;
  const { user } = useUser();
  const [completed, setCompleted] = useState<string[]>([]);
  const [startedId, setStartedId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tawjeeh.dashboard.completed') || '[]');
      if (Array.isArray(saved)) setCompleted(saved.filter((item): item is string => typeof item === 'string'));
    } catch {
      setCompleted([]);
    }
  }, []);

  if (dashboardQuery.isLoading) return <Shell title="مساحتي"><LoadingState /></Shell>;
  if (dashboardQuery.isError) return <Shell title="مساحتي"><ErrorState onRetry={() => dashboardQuery.refetch()} /></Shell>;
  if (!dashboard) return <Shell title="مساحتي"><EmptyState title="لم تصل خطتك بعد" body="ستظهر هنا أولويات يومك بمجرد تجهيز مساحة الدراسة." /></Shell>;

  const today = dashboard.today ?? [];
  const profile = dashboard.profile;
   const displayName = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || profile?.name || 'الطالب';

  return (
     <Shell title={`صباح الخير، ${displayName}`}>
       <section className="hero-grid mb-5">
        <div className="relative overflow-hidden rounded-[1.35rem] bg-[#004b75] px-6 py-7 text-white shadow-[0_16px_38px_rgba(0,86,137,.16)] md:px-8">
          <div className="absolute -left-10 -top-16 h-44 w-44 rounded-full border-[22px] border-[#b3e5fc] opacity-40" />
          <div className="absolute bottom-[-60px] right-[-28px] h-44 w-44 rounded-full border-[24px] border-[#b3e5fc] opacity-50" />
          <div className="relative z-[1] flex items-start justify-between gap-4">
            <div className="max-w-[500px]">
                <div className="mb-4 flex items-center gap-3"><AgentAvatar size="sm" pose={today.length > 0 && today.every((block) => block.completed || completed.includes(block.id)) ? 'success' : 'guiding'} /><span className="text-xs font-bold text-[#b3e5fc]">مساعدتك التعليمية اليوم</span></div>
              <h2 className="display mb-3 text-[27px] md:text-[34px]" data-testid="text-dashboard-focus">{dashboard.focus || 'نحو فهمٍ أعمق، خطوة واحدة كل مرة.'}</h2>
              <p className="mb-6 max-w-md text-sm leading-7 text-[#e6f6fb]">خطة صغيرة وواضحة الآن أفضل من ساعات طويلة مشتتة. لنبدأ من حيث أنت.</p>
                <Link href="/program" className="primary-button bg-[#e6f6fb] text-[#005689]" data-testid="link-open-program"><CalendarDays size={16} /> افتح خطة العشرة أيام</Link>
             </div>
          </div>
        </div>
      </section>

       <section>
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
                     <button className="secondary-button !rounded-lg !px-3 !py-2 !text-[11px]" onClick={() => { setStartedId(block.id); setCompleted((current) => { const next = current.includes(block.id) ? current : [...current, block.id]; localStorage.setItem('tawjeeh.dashboard.completed', JSON.stringify(next)); return next; }); }} data-testid={`button-complete-${block.id}`}>{startedId === block.id ? 'أحسنت' : 'ابدأ'}</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </Shell>
  );
}

function ProfilePage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [location, setLocation] = useLocation();
  const displayName = user?.firstName || user?.username || 'الطالب';
  const email = user?.primaryEmailAddress?.emailAddress || 'لم يضف بريدًا إلكترونيًا';
  const appId = user?.id || 'يظهر بعد اكتمال تسجيل الدخول';
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [savedAttempts, setSavedAttempts] = useState<string[]>([]);
  const [localSummaries, setLocalSummaries] = useState<Array<{
    lessonId?: string;
    lessonTitle?: string;
    summary?: string;
    concepts?: Array<{ id: string; title: string; summary: string }>;
    completedAt?: string;
    officialStamp?: string;
    logo?: string;
     groundingQuery?: string;
     groundingNodeIds?: string[];
  }>>([]);
  const summaryQuery = useGetSummaryBank({
    query: {
      queryKey: getGetSummaryBankQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const errorBankQuery = useGetErrorBank({
    query: {
      queryKey: getGetErrorBankQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const summaryBank = summaryQuery.data;
  const errorBank = errorBankQuery.data?.errors ?? [];
  const localSummaryCards: SummaryBankItem[] = localSummaries
    .filter((summary) => summary.lessonId && summary.lessonTitle && summary.summary && summary.completedAt)
    .map((summary, index) => ({
      id: -1 - index,
      lesson_id: summary.lessonId as string,
      lesson_title: summary.lessonTitle as string,
      subject: 'العلوم الفيزيائية',
      summary: summary.summary as string,
      concepts: summary.concepts ?? [],
      completed_at: summary.completedAt as string,
      official_stamp: summary.officialStamp ?? 'TAWJEEH.ED · OFFICIAL',
      logo: summary.logo ?? 'tawjeeh-owl-transparent.png',
       grounding_query: summary.groundingQuery ?? '',
       grounding_node_ids: summary.groundingNodeIds ?? [],
    }));
  const serverSummaries = summaryBank?.summaries ?? [];
  const summaries = [...serverSummaries, ...localSummaryCards.filter((local) => !serverSummaries.some((item) => item.lesson_id === local.lesson_id))];
  const weakConcepts = (summaryBank?.metrics ?? []).filter((metric) => metric.error_rate > 0.5);
  const [focusedConcept, setFocusedConcept] = useState<{ summaryId: number; conceptId: string } | null>(null);
  const summaryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const conceptRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem('tawjeeh.lesson.workspace.v1') || '{}') as { note?: string };
      const attempts = JSON.parse(localStorage.getItem('tawjeeh.attempt.bank.v1') || '[]') as Array<{ fileName?: string; firstErrorStep?: string }>;
      const profile = JSON.parse(localStorage.getItem('user.profile') || '{}') as { summaryBank?: typeof localSummaries };
      setSavedNotes(session.note?.trim() ? [session.note.trim()] : []);
      setSavedAttempts(attempts.slice(0, 3).map((item) => `${item.fileName || 'محاولة مكتوبة'} · ${item.firstErrorStep || 'مراجعة محفوظة'}`));
      setLocalSummaries(Array.isArray(profile.summaryBank) ? profile.summaryBank : []);
    } catch {
      setSavedNotes([]);
      setSavedAttempts([]);
      setLocalSummaries([]);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] ?? '');
    const summaryId = Number(params.get('summary'));
    const conceptId = params.get('concept');
    if (!Number.isFinite(summaryId) || !conceptId) {
      setFocusedConcept(null);
      return;
    }
    setFocusedConcept({ summaryId, conceptId });
    window.requestAnimationFrame(() => {
      conceptRefs.current[`${summaryId}:${conceptId}`]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      summaryRefs.current[String(summaryId)]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [location, summaries.length]);

  return (
    <Shell title="الملف الشخصي">
      <section className="profile-page" dir="rtl">
        <div className="profile-identity-card">
          <div className="profile-avatar-placeholder" aria-hidden="true">{displayName.slice(0, 1)}</div>
          <div className="profile-identity-content">
            <p className="eyebrow">بيانات الحساب</p>
            <h2 className="display">{displayName}</h2>
            <div className="profile-email-row">
              <span>البريد الإلكتروني</span>
              <strong dir="ltr">{email}</strong>
            </div>
          </div>
        </div>
        <div className="profile-id-card">
          <div className="profile-id-copy">
            <span className="eyebrow">معرّف التطبيق</span>
            <strong dir="ltr">{appId}</strong>
            <small>هذا المعرّف مرتبط بحسابك المسجل، وليس اسمًا افتراضيًا.</small>
          </div>
          <div className="profile-id-icon" aria-hidden="true"><UserRound size={22} /></div>
        </div>
        <div className="profile-actions">
          <Link href="/program" className="primary-button"><CalendarDays size={16} /> افتح برنامجك الدراسي</Link>
          <button type="button" className="secondary-button" onClick={() => { sessionStorage.removeItem('tawjeeh.program.lesson-access.v1'); void signOut({ redirectUrl: `${basePath}/sign-in` }); }} data-testid="button-sign-out"><LogOut size={16} /> تسجيل الخروج</button>
        </div>
        <div className="profile-learning-grid">
          <section className="surface profile-bank-card">
            <div className="profile-bank-heading"><div><p className="eyebrow mb-1">أثر جلساتك</p><div className="flex flex-wrap items-center gap-2"><h3 className="display text-lg">بنك الملخصات</h3><span className="profile-official-stamp" data-testid="stamp-official-summary">TAWJEEH.ED · OFFICIAL</span></div></div></div>
            <div className="profile-bank-list">
               {summaryQuery.isLoading ? <p className="profile-bank-empty">نسترجع ملخصات جلساتك...</p> : summaries.length ? summaries.map((summary: SummaryBankItem) => <div className={`profile-summary-item ${focusedConcept?.summaryId === summary.id ? 'is-focused' : ''}`} ref={(element) => { summaryRefs.current[String(summary.id)] = element; }} key={summary.id} data-testid={`card-summary-${summary.id}`}><div className="profile-summary-item-heading"><FileText size={15} /><strong>{summary.lesson_title}</strong><small>{summary.completed_at.slice(0, 10)}</small></div><p>{summary.summary}</p><div className="profile-summary-concepts">{summary.concepts.map((concept) => <span ref={(element) => { conceptRefs.current[`${summary.id}:${concept.id}`] = element; }} className={focusedConcept?.summaryId === summary.id && focusedConcept.conceptId === concept.id ? 'is-focused' : ''} key={concept.id}>{concept.title}</span>)}</div></div>) : savedNotes.length ? savedNotes.map((note, index) => <div className="profile-bank-item" key={`${note}-${index}`}><FileText size={15} /><span>{note.slice(0, 90)}{note.length > 90 ? '…' : ''}</span></div>) : <p className="profile-bank-empty">أكمل عناصر جلسة فهيم، وسيظهر ملخصها هنا لتعود إليه قبل المراجعة.</p>}
            </div>
          </section>
          <section className="surface profile-bank-card">
            <div className="profile-bank-heading"><div><p className="eyebrow mb-1">نتعلّم من المحاولة</p><h3 className="display text-lg">بنك الأخطاء</h3></div></div>
            <div className="profile-bank-list">
               {errorBankQuery.isLoading ? <p className="profile-bank-empty">نسترجع مواضع الأخطاء...</p> : errorBank.length ? errorBank.map((error: ErrorBankItem) => <button type="button" className="profile-error-item" key={error.id} disabled={error.summary_id === null} onClick={() => { if (error.summary_id !== null) setLocation(`/profile?summary=${error.summary_id}&concept=${encodeURIComponent(error.concept_id)}`); }} data-testid={`button-error-bank-${error.id}`}><RotateCcw size={15} /><span><strong>{error.concept_title}</strong><small>{error.error_tag} · {error.summary_id === null ? 'بانتظار ملخص الدرس' : 'افتح موضعه في الملخص'}</small></span><ChevronLeft size={15} /></button>) : savedAttempts.length ? savedAttempts.map((attempt, index) => <div className="profile-bank-item" key={`${attempt}-${index}`}><RotateCcw size={15} /><span>{attempt}</span></div>) : <p className="profile-bank-empty">أرفق صورة حل أو أجب عن تمرين في جلسة فهيم. سنحفظ كل موضع خطأ لتعود إليه.</p>}
             </div>
           </section>
          <section className="surface profile-metrics-card">
           <div className="flex items-start justify-between gap-3"><div><p className="eyebrow mb-1">إشارات الفهم</p><h3 className="display text-lg">المفاهيم التي تحتاج إنعاشًا</h3></div><span className="profile-metric-count">{weakConcepts.length}</span></div>
           <div className="profile-metrics-list">
             {summaryQuery.isLoading ? <p className="profile-bank-empty">نحلل محاولاتك...</p> : weakConcepts.length ? weakConcepts.map((metric) => <div className="profile-metric-row" key={`${metric.lesson_id}-${metric.concept_id}`}><div><strong>{metric.concept_title}</strong><span>{metric.errors_count} أخطاء من {metric.attempts} محاولات · {Math.round(metric.error_rate * 100)}٪</span></div><span className="profile-emergency-tag">غرفة إنعاش مستعجلة</span></div>) : <p className="profile-bank-empty">لا توجد فجوة تتجاوز ٥٠٪ بعد. استمري في المحاولة، فكل إجابة تحسّن الخريطة.</p>}
           </div>
          </section>
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
  const resultCards = searched ? (searchMutation.data?.results ?? []) : baseCards;
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
       <p className="eyebrow mb-2">{result.mode === 'error_stack' ? 'مكدسات الأخطاء · ربط بالمفاهيم' : result.mode === 'pre_exam' ? 'محاكاة البكالوريا · ورقة متنوعة' : result.is_high_difficulty ? 'تقييم الوحدة عالي الصعوبة' : 'اكتملت المحاولة'}</p><h2 className="display mb-2 text-3xl">{result.message || 'عمل جميل، واصل التقدم.'}</h2>
       <p className="mb-7 text-sm text-[#64748b]">هذه النتيجة نقطة بداية ذكية لجلسة المراجعة القادمة.</p>
       {result.linked_concepts.length > 0 && <div className="quiz-result-links" data-testid="text-quiz-linked-concepts"><span>المفاهيم المرتبطة:</span>{result.linked_concepts.map((concept) => <b key={concept}>{concept}</b>)}</div>}
       <div className="mb-7 grid grid-cols-3 divide-x divide-x-reverse divide-[#b3e5fc] rounded-2xl bg-[#e6f6fb] p-4">
         <div><strong className="mono block text-2xl text-[#005689]">{percentage}%</strong><span className="text-[10px] font-bold text-[#64748b]">النتيجة</span></div>
         <div><strong className="mono block text-2xl text-[#2e8b7b]">{result.correct}</strong><span className="text-[10px] font-bold text-[#64748b]">صحيح</span></div>
         <div><strong className="mono block text-2xl text-[#005689]">{result.points_earned}</strong><span className="text-[10px] font-bold text-[#64748b]">نقطة</span></div>
      </div>
      <button className="primary-button" onClick={onAgain} data-testid="button-quiz-again"><RotateCcw size={16} /> العودة للاختبارات</button>
    </div>
  );
}

function QuizAttempt({ quiz, examDate, onExit, onScore }: { quiz: Quiz; examDate?: string; onExit: () => void; onScore: (result: QuizResult) => void }) {
  const submitMutation = useSubmitQuizAttempt();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const question = quiz.questions?.[questionIndex];
  if (result) return <QuizResultCard result={result} onAgain={onExit} />;
  if (!question) return <EmptyState title="لا توجد أسئلة" body="هذا الاختبار لا يحتوي على أسئلة قابلة للعرض حاليًا." action={<button className="secondary-button" onClick={onExit} data-testid="button-exit-empty-quiz">العودة</button>} />;
  const isLast = questionIndex === quiz.questions.length - 1;
  const choose = (option: string) => setAnswers((current) => ({ ...current, [question.id]: option }));
   const submit = () => submitMutation.mutate({ quizId: quiz.id, data: { answers, exam_date: examDate } }, {
    onSuccess: (data) => {
      setResult(data);
       onScore(data);
    },
  });
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
  const isWeekly = quiz.id === 'weekly-physics';
  const locked = quiz.is_high_difficulty && quiz.status.startsWith('يفتح');
  const modeLabel = quiz.mode === 'error_stack' ? 'مكدسات الأخطاء' : quiz.mode === 'pre_exam' ? 'محاكاة البكالوريا' : isWeekly ? 'مخصص لمستواك' : 'تحدّي صعب';
  return (
    <article className="surface flex flex-col p-5" data-testid={`card-quiz-${quiz.id}`}>
       <div className="mb-5 flex items-start justify-between gap-2"><span className={`tag ${quiz.mode === 'error_stack' ? 'bg-[#fff1d5] text-[#a46618]' : quiz.mode === 'pre_exam' ? 'bg-[#f0eaff] text-[#6d4b9a]' : 'bg-[#e8f8f5] text-[#2e8b7b]'}`}>{modeLabel}</span><span className="text-[11px] font-bold text-[#64748b]">{quiz.status}</span></div>
       <h3 className="mb-2 text-lg font-extrabold">{quiz.title}</h3><p className="mb-6 min-h-[48px] text-sm leading-7 text-[#64748b]">{quiz.description}</p>
        <div className="mb-5 flex flex-wrap items-center gap-4 text-[11px] font-bold text-[#64748b]"><span className="flex items-center gap-1"><Clock3 size={14} /> {quiz.duration}</span><span className="flex items-center gap-1"><CircleHelp size={14} /> {quiz.questions?.length ?? 0} أسئلة</span><span className="flex items-center gap-1"><Zap size={14} /> كثافة ×{quiz.exercise_density}</span><span className="flex items-center gap-1"><Zap size={14} /> {quiz.points} نقطة</span></div>
       <button className="primary-button mt-auto w-full" disabled={locked} onClick={onStart} data-testid={`button-start-quiz-${quiz.id}`}><Play size={15} fill="currentColor" /> {locked ? 'أكمل الوحدة أولًا' : quiz.is_high_difficulty ? 'ابدأ التقييم' : 'ابدأ التدريب'}</button>
    </article>
  );
}

function QuizzesPage() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [examDate] = useState(() => localStorage.getItem(examDateKey) || defaultExamDate);
  const attemptsQuery = useListQuizAttempts({ query: { queryKey: getListQuizAttemptsQueryKey() } });
  const examModeQuery = useGetExamMode(
    { exam_date: examDate },
    { query: { queryKey: getGetExamModeQueryKey({ exam_date: examDate }), staleTime: 60_000 } },
  );
  const quizzesQuery = useListQuizzes({ exam_date: examDate }, { query: { queryKey: getListQuizzesQueryKey({ exam_date: examDate }) } });
  const quizzes = (quizzesQuery.data as Quiz[] | undefined) ?? [];
  const hardAttempts = (attemptsQuery.data?.attempts ?? []).filter((attempt: QuizAttemptRecord) => attempt.is_high_difficulty);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [mistakeCount, setMistakeCount] = useState(0);
  useEffect(() => {
    try {
      const attempts = JSON.parse(localStorage.getItem('tawjeeh.attempt.bank.v1') || '[]');
      setMistakeCount(Array.isArray(attempts) ? attempts.length : 0);
    } catch {
      setMistakeCount(0);
    }
  }, []);
  useEffect(() => {
    const quizId = new URLSearchParams(location.split('?')[1] ?? '').get('quiz');
    const requestedQuiz = quizzes.find((quiz) => quiz.id === quizId);
    if (requestedQuiz && !selectedQuiz && !requestedQuiz.status.startsWith('يفتح')) {
      setSelectedQuiz(requestedQuiz);
    }
  }, [location, quizzes, selectedQuiz]);
  const today = new Date().toISOString().slice(0, 10);
  const dailyScore = (attemptsQuery.data?.attempts ?? [])
    .filter((attempt: QuizAttemptRecord) => attempt.completed_at.slice(0, 10) === today)
    .reduce((total, attempt: QuizAttemptRecord) => total + attempt.points_earned, 0);
  if (selectedQuiz) return <Shell title="جلسة تدريب"><QuizAttempt quiz={selectedQuiz} examDate={examDate} onExit={() => { setSelectedQuiz(null); setLocation('/quizzes'); }} onScore={(result) => { void attemptsQuery.refetch(); void queryClient.invalidateQueries({ queryKey: getGetErrorBankQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetSummaryBankQueryKey() }); if (result.mode !== 'standard') void quizzesQuery.refetch(); }} /></Shell>;
  return (
    <Shell title="الاختبارات الأسبوعية">
       <section className="mb-5 flex items-end justify-between gap-4 rounded-[1.35rem] border border-[#2e8b7b] bg-[#e8f8f5] p-6 md:p-8">
         <div><p className="eyebrow mb-2 text-[#2e8b7b]">كويزاتك الأسبوعية</p><h2 className="display text-[26px] md:text-[34px]">اختبر فهمك، بهدوء.</h2><p className="mt-3 max-w-xl text-sm leading-7 text-[#64748b]">الأول يتابع مستواك وما ظهر في محاولاتك، والثاني تحدٍّ عام صعب بعد إتمام الوحدة.</p><p className="mt-2 text-xs font-bold text-[#2e8b7b]">{mistakeCount ? `تم رصد ${mistakeCount} محاولات للمراجعة هذا الأسبوع.` : 'ستتكوّن مراجعتك من إجاباتك ومحاولاتك القادمة.'}</p></div>
         <div className="hidden rounded-2xl bg-[#e6f6fb] p-4 text-[#005689] sm:block"><Target size={32} strokeWidth={1.5} /></div>
      </section>
       {examModeQuery.data && examModeQuery.data.mode !== 'standard' && <section className={`quiz-exam-mode-banner ${examModeQuery.data.mode === 'error_stack' ? 'is-error-stack' : ''}`} data-testid="card-quiz-exam-mode"><div><span className="eyebrow">{examModeQuery.data.label}</span><h3>{examModeQuery.data.mode === 'error_stack' ? 'نحوّل أخطاءك المتكررة إلى نقاط قوة.' : 'أوراق محاكاة متنوعة ترفع جاهزيتك.'}</h3><p>{examModeQuery.data.description}</p></div><div className="quiz-exam-mode-stat"><strong>{Math.max(0, examModeQuery.data.days_until)}</strong><span>يومًا حتى الموعد</span><b>كثافة ×{examModeQuery.data.exercise_density}</b></div></section>}
       <section className="phase-one-score-card" data-testid="card-daily-score-threshold">
         <div className="phase-one-score-heading">
           <div><span className="eyebrow">مقياس التقدم اليومي</span><h2 className="display">نقطة اليوم تربطنا بالنجاح.</h2></div>
           <div className="phase-one-score-values"><strong data-testid="text-daily-score">{dailyScore}</strong><span>/ 70 نقطة</span></div>
         </div>
         <div className="phase-one-score-track" aria-label="التقدم نحو الحد اليومي"><span style={{ width: `${Math.min(100, Math.round((dailyScore / 70) * 100))}%` }} /></div>
         <div className="phase-one-score-footer"><span><CheckCircle2 size={14} /> الحد المطلوب اليومي: ٧٠ نقطة</span><span><Trophy size={14} /> مؤشر النجاح: ١٠ / ٢٠ في المعدل</span><span>{dailyScore >= 70 ? 'أتممت حد اليوم' : `تبقّى ${Math.max(0, 70 - dailyScore)} نقطة`}</span></div>
       </section>
       {hardAttempts.length > 0 && <section className="quiz-attempt-history" data-testid="card-unit-assessment-history"><div><span className="eyebrow">سجل تقييم الوحدة</span><h3 className="display text-lg">نتائج التحدّي عالي الصعوبة</h3></div><div className="quiz-attempt-history-list">{hardAttempts.slice(0, 5).map((attempt: QuizAttemptRecord) => <div className="quiz-attempt-history-row" key={attempt.id}><span><strong>{attempt.score}%</strong><small>{attempt.correct} من {attempt.total} · {attempt.completed_at.slice(0, 10)}</small></span><b className={attempt.passed ? 'passed' : 'retry'}>{attempt.passed ? 'اجتاز' : 'يحتاج محاولة أخرى'}</b></div>)}</div></section>}
      {quizzesQuery.isLoading ? <LoadingState label="نحضّر تمارين مناسبة لك..." /> : quizzesQuery.isError ? <ErrorState onRetry={() => quizzesQuery.refetch()} /> : quizzes.length === 0 ? <EmptyState title="لا توجد اختبارات بعد" body="ستجد هنا تدريبات الوحدات والاختبار الأسبوعي عند توفرها." /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{quizzes.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} onStart={() => setSelectedQuiz(quiz)} />)}</div>}
     </Shell>
  );
}

type ChatMessage = { id: string; from: 'student' | 'agent'; text: string };
const agentOptions = [
  { id: 'host', name: 'توجيه', role: 'محادثة عامة' },
  { id: 'fahim', name: 'فَهيم', role: 'تشخيص الفجوات' },
  { id: 'dalil', name: 'دليل', role: 'شرح المفاهيم' },
  { id: 'planner', name: 'المخطّط', role: 'تنظيم الوقت والمواعيد' },
];
const starterMessages: ChatMessage[] = [{ id: 'starter', from: 'agent', text: 'أهلًا بك. اكتب ما يشغلك الآن، وسأساعدك في الوصول إلى الشرح أو التدريب المناسب.' }];

function ChatPage() {
  const [agent, setAgent] = useState('host');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState('');
  const selectedAgent = agentOptions.find((item) => item.id === agent) ?? agentOptions[0];
  const send = async (value = text) => {
    const clean = value.trim();
    if (!clean || isThinking) return;
    setError('');
    setMessages((current) => [...current, { id: `student-${Date.now()}`, from: 'student', text: clean }]);
    setText('');
    setIsThinking(true);
    try {
      const response = await fetch('/api/fahim/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: clean,
          lesson: 'المساعدة الدراسية العامة',
          concept: selectedAgent.role,
          context: `نوع المساعدة المختار: ${selectedAgent.name} — ${selectedAgent.role}.`,
        }),
      });
      const payload = await response.json() as { answer?: string; message?: string };
      if (!response.ok || !payload.answer) {
        throw new Error(payload.message || 'تعذر الحصول على رد فهيم الآن.');
      }
      setMessages((current) => [...current, { id: `agent-${Date.now()}`, from: 'agent', text: payload.answer as string }]);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'تعذر الحصول على رد فهيم الآن.';
      setError(message);
      setMessages((current) => [...current, { id: `agent-error-${Date.now()}`, from: 'agent', text: 'لم أتمكن من الوصول إلى المساعد الآن. يمكنك إعادة إرسال السؤال بعد لحظات.' }]);
    } finally {
      setIsThinking(false);
    }
  };
  return (
    <Shell title="اسأل توجيه">
      <div className="grid grid-cols-[.75fr_1.5fr] gap-5 two-col">
         <aside className="surface order-2 border-[#b3e5fc] p-5 lg:order-1">
           <p className="eyebrow mb-1">اختر نوع المساعدة</p><h2 className="display mb-5 text-xl">المساعدة المناسبة</h2>
            <div className="space-y-2">{agentOptions.map((item) => { const active = item.id === agent; return <button key={item.id} onClick={() => setAgent(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition ${active ? 'border-[#2e8b7b] bg-[#e8f8f5]' : 'border-transparent bg-[#f7fcfe] hover:border-[#b3e5fc]'}`} data-testid={`button-agent-${item.id}`}>{item.id === 'host' ? <AgentAvatar size="sm" /> : <span className={`grid h-11 w-11 place-items-center rounded-[26%] ${active ? 'bg-[#e6f6fb] text-[#005689]' : 'bg-[#f7fcfe] text-[#64748b]'}`}>{item.id === 'fahim' ? <BrainCircuit size={20} /> : item.id === 'planner' ? <CalendarDays size={20} /> : <BookOpen size={20} />}</span>}<span><strong className="block text-sm font-extrabold">{item.name}</strong><small className="mt-0.5 block text-[10px] text-[#64748b]">{item.role}</small></span>{active && <CheckCircle2 className="mr-auto text-[#2e8b7b]" size={17} />}</button>; })}</div>
           <div className="mt-5 rounded-2xl bg-[#e8f8f5] p-4"><div className="mb-2 flex items-center gap-2 text-[#005689]"><Sparkles size={15} /><span className="text-xs font-extrabold">اقتراح سريع</span></div><p className="text-xs font-bold leading-6 text-[#64748b]">إن لم تعرف من تختار، ابدأ بالمحادثة العامة وسنحدد الخطوة التالية.</p></div>
        </aside>
        <section className="surface order-1 flex min-h-[570px] flex-col overflow-hidden lg:order-2">
            <div className="flex items-center gap-3 border-b border-[#b3e5fc] bg-[#f7fcfe] px-5 py-4"><div className="relative">{selectedAgent.id === 'host' ? <AgentAvatar size="sm" /> : <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e6f6fb] text-[#005689]">{selectedAgent.id === 'fahim' ? <BrainCircuit size={17} /> : selectedAgent.id === 'planner' ? <CalendarDays size={17} /> : <BookOpen size={17} />}</span>}<i className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#f7fcfe] bg-[#2e8b7b]" /></div><div><strong className="block text-sm font-extrabold">{selectedAgent.name}</strong><span className="text-[10px] text-[#64748b]">{selectedAgent.role} · {isThinking ? 'يفكر الآن' : 'متصل الآن'}</span></div><MoreHorizontal className="mr-auto text-[#64748b]" size={19} /></div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5 md:p-7">{messages.map((message) => <div key={message.id} className={`flex items-end gap-2 ${message.from === 'student' ? 'justify-start' : 'justify-end'}`} data-testid={`message-chat-${message.id}`}>{message.from === 'agent' && <AgentAvatar size="sm" />}<div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-7 ${message.from === 'student' ? 'rounded-bl-md bg-[#004b75] text-white' : 'rounded-br-md bg-[#e8f8f5] text-[#005689]'}`}>{message.text}</div></div>)}{isThinking && <div className="flex items-end justify-end gap-2" data-testid="status-chat-thinking"><AgentAvatar size="sm" /><div className="rounded-2xl rounded-br-md bg-[#e8f8f5] px-4 py-3 text-sm text-[#005689]">فهيم يكتب الآن...</div></div>}</div>
            <div className="border-t border-[#b3e5fc] p-4"><div className="mb-3 flex flex-wrap gap-2">{['اشرح لي درسًا', 'اختبرني قليلًا', 'أين أخطئ؟'].map((prompt) => <button key={prompt} onClick={() => void send(prompt)} disabled={isThinking} className="tag bg-[#f7fcfe] text-[#64748b] transition hover:bg-[#e6f6fb] disabled:cursor-wait disabled:opacity-60" data-testid={`button-prompt-${prompt}`}>{prompt}</button>)}</div>{error && <p className="mb-2 text-xs font-bold text-[#a34e4e]" role="alert" data-testid="status-chat-error">{error}</p>}<form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}><button type="button" className="icon-button h-11 w-11 shrink-0" onClick={() => setText((current) => current || 'أريد إرفاق ملفًا')} data-testid="button-attach" aria-label="إرفاق ملف"><Paperclip size={18} /></button><textarea rows={1} value={text} onChange={(event) => setText(event.target.value)} className="min-h-11 flex-1 resize-none rounded-xl border border-[#b3e5fc] bg-white px-4 py-3 text-sm outline-none focus:border-[#005689]" placeholder="اكتب سؤالك هنا..." data-testid="input-chat-message" /><button className="primary-button h-11 w-11 shrink-0 !p-0" type="submit" disabled={!text.trim() || isThinking} data-testid="button-send-message" aria-label="إرسال الرسالة"><Send size={17} /></button></form><p className="mt-2 text-center text-[10px] text-[#64748b]">توجيه يساعدك على الفهم، وأنت صاحب القرار في رحلتك.</p></div>
        </section>
      </div>
    </Shell>
  );
}

function NotFoundArabic() {
   return <div className="app-shell flex min-h-[100dvh] items-center justify-center p-6"><div className="surface max-w-md p-9 text-center"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#e8f8f5] text-[#2e8b7b]"><Compass size={28} /></div><h1 className="display mb-3 text-2xl">هذه الصفحة خارج الخريطة</h1><p className="mb-6 text-sm leading-7 text-[#64748b]">لنعد إلى مساحة الدراسة ونكمل من حيث توقفت.</p><Link href="/" className="primary-button" data-testid="link-not-found-home">العودة إلى مساحتي <ArrowLeft size={16} /></Link></div></div>;
   return <div className="app-shell flex min-h-[100dvh] items-center justify-center p-6"><div className="surface max-w-md p-9 text-center"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#e8f8f5] text-[#2e8b7b]"><Compass size={28} /></div><h1 className="display mb-3 text-2xl">هذه الصفحة خارج الخريطة</h1><p className="mb-6 text-sm leading-7 text-[#64748b]">لنعد إلى البرنامج ونكمل من حيث توقفت.</p><Link href="/program" className="primary-button" data-testid="link-not-found-home">العودة إلى البرنامج الدراسي <ArrowLeft size={16} /></Link></div></div>;
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/practice" component={MathPractice} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/dashboard" component={() => <ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/profile" component={() => <ProtectedRoute><ProfilePage /></ProtectedRoute>} />
         <Route path="/program" component={() => <ProtectedRoute><Shell title="البرنامج الدراسي"><ProgramAgent /></Shell></ProtectedRoute>} />
        <Route path="/lesson/:id" component={() => <ProtectedRoute><ProgramLessonRoute /></ProtectedRoute>} />
        <Route path="/library" component={() => <ProtectedRoute><KnowledgePage /></ProtectedRoute>} />
        <Route path="/quizzes" component={() => <ProtectedRoute><QuizzesPage /></ProtectedRoute>} />
        <Route path="/chat" component={() => <ProtectedRoute><Redirect to="/program" /></ProtectedRoute>} />
        <Route component={NotFoundArabic} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        locale: 'ar-SA',
        socialButtonsBlockButton: 'المتابعة باستخدام Google',
        dividerText: 'أو',
        formFieldLabel__emailAddress: 'البريد الإلكتروني',
        formFieldLabel__password: 'كلمة المرور',
        formFieldLabel__firstName: 'الاسم الأول',
        formFieldLabel__lastName: 'اسم العائلة',
        formFieldInputPlaceholder__emailAddress: 'أدخل بريدك الإلكتروني',
        formFieldInputPlaceholder__password: 'أدخل كلمة المرور',
        formFieldInputPlaceholder__signUpPassword: 'أنشئ كلمة مرور قوية',
        formFieldInputPlaceholder__firstName: 'أدخل اسمك الأول',
        formFieldInputPlaceholder__lastName: 'أدخل اسم عائلتك',
        formFieldAction__forgotPassword: 'هل نسيت كلمة المرور؟',
        formButtonPrimary: 'المتابعة',
        formButtonPrimary__verify: 'تأكيد',
        signIn: {
          start: {
            title: 'مرحبًا بعودتك',
            subtitle: 'سجّل دخولك لتواصل التعلّم',
            actionText: 'ليس لديك حساب؟',
            actionLink: 'إنشاء حساب',
          },
          password: {
            title: 'أدخل كلمة المرور',
            subtitle: 'أدخل كلمة المرور للمتابعة إلى مساحتك.',
            actionLink: 'هل نسيت كلمة المرور؟',
          },
        },
        signUp: {
          start: {
            title: 'أنشئ حسابك في توجيه',
            subtitle: 'خطوتك الأولى نحو تعلّم أكثر وضوحًا',
            actionText: 'لديك حساب بالفعل؟',
            actionLink: 'تسجيل الدخول',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Router />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function AppRoot() {
  return (
    <WouterRouter base={basePath}>
      <App />
    </WouterRouter>
  );
}

export default AppRoot;