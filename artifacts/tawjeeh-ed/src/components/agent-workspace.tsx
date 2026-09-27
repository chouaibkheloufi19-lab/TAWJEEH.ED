import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowUpLeft,
  BookOpen,
  Check,
  CircleAlert,
  FlaskConical,
  Lightbulb,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  getGetOrchestratorStateQueryKey,
  getGetOrchestratorStateMachineQueryKey,
  useGetOrchestratorState,
  useGetOrchestratorStateMachine,
  useQueryKnowledge,
  useRecordLearningAttempt,
  type AgentOrchestratorState,
  type KnowledgeCard,
  type OrchestratorState,
} from '@workspace/api-client-react';
import { LessonWorkspace } from '@/components/lesson-workspace';
import owlAgentTeal from '@assets/agent-creation-cropped.png';
import owlAgentThinking from '@assets/agent-thinking-cropped.png';
import owlAgentViolet from '@assets/agent-thinking-cropped.png';

type WorkspacePhase = 'faheem' | 'dalil-exercises';
type LearningMode = 'explanation' | 'exercise';

export type AgentWorkspaceProps = {
  entryDate: string;
  onOpenLesson: (lessonId?: string) => void;
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

const fallbackConcepts = [
  { id: 'motion', label: 'الحركة والقوة', state: 'الخطوة الحالية' },
  { id: 'forces', label: 'القوة المحصلة', state: 'تأتي بعدها' },
  { id: 'graphs', label: 'قراءة التمثيل البياني', state: 'في الخطة' },
];

const defaultMessages: ChatMessage[] = [
  {
    id: 'dalil-welcome',
    role: 'assistant',
    text: 'أنا دليل. أشرح الفكرة من زاوية المنهاج، ثم أترك لك خطوة قصيرة تثبت أنك فهمتها.',
  },
];

function phaseForAgent(agent: OrchestratorState['active_agent'] | undefined): WorkspacePhase {
  return agent === 'Daleel' || agent === 'Exercise' ? 'dalil-exercises' : 'faheem';
}

function agentLabel(agent: OrchestratorState['active_agent'] | undefined) {
  if (agent === 'Daleel') return 'دليل';
  if (agent === 'Exercise') return 'وكيل التمارين';
  return 'فهيم';
}

function formatEntryDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ar-DZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function AgentAvatar({ phase }: { phase: WorkspacePhase }) {
  const source = phase === 'faheem' ? owlAgentTeal : owlAgentViolet;
  const label = phase === 'faheem' ? 'فهيم' : 'دليل ووكيل التمارين';
  return (
    <span className="agent-workspace-avatar">
      <img src={source} alt={label} data-testid="img-agent-workspace-avatar" />
    </span>
  );
}

function WorkspaceLoading() {
  return (
    <div className="agent-workspace-loading" role="status" aria-label="جاري تجهيز حالة الوكلاء" data-testid="state-agent-workspace-loading">
      <span />
      <span />
      <span />
    </div>
  );
}

function MasteryRail({
  orchestrator,
  onOpenLesson,
}: {
  orchestrator?: AgentOrchestratorState;
  onOpenLesson: (lessonId?: string) => void;
}) {
  const activeEntry = orchestrator?.entries.find((entry) => entry.status === 'ACTIVE') ?? orchestrator?.entries[0];
  const concepts = orchestrator?.learning.current_concept_ids.length
    ? orchestrator.learning.current_concept_ids.slice(0, 4).map((id, index) => ({
      id,
      label: id.replace(/[-_]/g, ' '),
      state: index === 0 ? 'التركيز الحالي' : 'ضمن الخطة',
    }))
    : fallbackConcepts;
  const masteredDays = orchestrator?.diagnostic.mastered_days.length ?? 0;
  const pendingDays = orchestrator?.diagnostic.pending_days.length ?? 0;
  const threshold = orchestrator?.learning.mastery_threshold;

  return (
    <aside className="agent-workspace-context-rail" aria-label="مسار الإتقان" data-testid="panel-agent-mastery">
      <div className="agent-workspace-rail-title">
        <div>
          <span className="agent-workspace-panel-kicker"><Target size={13} /> مسار الإتقان</span>
          <h2>ما الذي يثبت الآن؟</h2>
          <p>فهيم يفتح خطوة واحدة، ودليل يثبتها.</p>
        </div>
        <span className="agent-workspace-rail-icon"><BookOpen size={17} /></span>
      </div>
      <div className="agent-workspace-mastery-list">
        {concepts.map((concept, index) => (
          <div className={`agent-workspace-mastery-item ${index === 0 ? 'is-current' : ''}`} key={concept.id} data-testid={`item-mastery-concept-${concept.id}`}>
            <span className="agent-workspace-mastery-dot" aria-hidden="true" />
            <div>
              <strong title={concept.label}>{concept.label}</strong>
              <span>{concept.state}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="agent-workspace-stat"><span>أيام التشخيص المثبتة</span><strong>{masteredDays}</strong></div>
      <div className="agent-workspace-stat"><span>أيام بانتظار الدليل</span><strong>{pendingDays}</strong></div>
      {threshold !== undefined && (
        <div className="agent-workspace-stat"><span>عتبة الإتقان</span><strong>{Math.round(threshold * 100)}٪</strong></div>
      )}
      <button
        type="button"
        className="agent-workspace-next"
        onClick={() => onOpenLesson(activeEntry?.entry_id ?? 'newton-motion')}
        data-testid="button-open-agent-lesson"
      >
        افتح الجلسة الحالية <ArrowLeft size={14} />
      </button>
    </aside>
  );
}

function FaheemCoachRail({ onOpenLesson, lessonId }: { onOpenLesson: (lessonId?: string) => void; lessonId?: string }) {
  return (
    <aside className="agent-workspace-coach-rail" aria-label="توجيه فهيم" data-testid="panel-faheem-coach">
      <div className="agent-workspace-rail-title">
        <div>
          <span className="agent-workspace-panel-kicker"><Sparkles size={13} /> فهيم قريب</span>
          <h2>الخطوة التالية</h2>
          <p>لا تفتح كل المسار دفعة واحدة.</p>
        </div>
        <span className="agent-workspace-rail-icon"><Lightbulb size={17} /></span>
      </div>
      <div className="agent-workspace-coach-message">
        <strong>اسأل عن الجزء الذي توقف عنده فهمك.</strong>
        <span>يمكنك تحديد أي منطقة في السبورة داخل جلسة فهيم، ثم إرسالها إلى الحوار.</span>
      </div>
      <ul className="agent-workspace-coach-list">
        <li><Check size={13} /> اشرح الفكرة بصوتك قبل الانتقال.</li>
        <li><Check size={13} /> اكتب محاولة قصيرة، لا ملخصًا طويلًا.</li>
        <li><Check size={13} /> اترك التمرين التالي للوكلاء.</li>
      </ul>
      <button
        type="button"
        className="agent-workspace-next"
        onClick={() => onOpenLesson(lessonId ?? 'newton-motion')}
        data-testid="button-continue-faheem"
      >
        متابعة مع فهيم <ArrowUpLeft size={14} />
      </button>
    </aside>
  );
}

function FaheemPhase({
  onOpenLesson,
}: {
  onOpenLesson: (lessonId?: string) => void;
}) {
  return (
    <section className="agent-workspace-faheem-shell" aria-label="مرحلة فهيم" data-testid="panel-faheem-phase">
      <div className="agent-workspace-lesson-surface" data-testid="surface-faheem-lesson">
        <LessonWorkspace />
      </div>
    </section>
  );
}

function KnowledgeSources({ sources }: { sources: KnowledgeCard[] }) {
  if (!sources.length) return null;
  return (
    <div className="agent-workspace-source-list" aria-label="مصادر الشرح" data-testid="list-dalil-sources">
      {sources.slice(0, 3).map((source) => (
        <span key={source.id} title={`${source.source} · صفحة ${source.page}`}>{source.title}</span>
      ))}
    </div>
  );
}

function DalilContent({
  mode,
  title,
  subject,
  answer,
  exerciseSubmitted,
  exerciseError,
  sources,
  onModeChange,
  onAnswerChange,
  onSubmitExercise,
}: {
  mode: LearningMode;
  title: string;
  subject: string;
  answer: string;
  exerciseSubmitted: boolean;
  exerciseError: string;
  sources: KnowledgeCard[];
  onModeChange: (mode: LearningMode) => void;
  onAnswerChange: (answer: string) => void;
  onSubmitExercise: () => void;
}) {
  return (
    <section className="agent-workspace-content" aria-label="محتوى دليل والتمارين" data-testid="panel-dalil-content">
      <div className="agent-workspace-content-heading">
        <div>
          <span className="agent-workspace-panel-kicker"><Lightbulb size={13} /> {subject}</span>
          <h2>{title}</h2>
          <p>اختر بين شرح يوضح الفكرة وتمرين يختبر قدرتك على استعمالها.</p>
        </div>
        <span className="agent-workspace-content-mark"><FlaskConical size={22} /></span>
      </div>
      <div className="agent-workspace-mode-tabs" role="tablist" aria-label="اختيار نوع جلسة دليل">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'explanation'}
          className={`agent-workspace-mode-tab ${mode === 'explanation' ? 'is-active' : ''}`}
          onClick={() => onModeChange('explanation')}
          data-testid="button-mode-explanation"
        >
          <BookOpen size={14} /> شرح الفكرة
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'exercise'}
          className={`agent-workspace-mode-tab ${mode === 'exercise' ? 'is-active' : ''}`}
          onClick={() => onModeChange('exercise')}
          data-testid="button-mode-exercise"
        >
          <Target size={14} /> تمرين قصير
        </button>
      </div>
      {mode === 'explanation' ? (
        <article className="agent-workspace-explanation" data-testid="card-dalil-explanation">
          <span className="agent-workspace-panel-kicker">شرح دليل · من الأساس إلى التطبيق</span>
          <h3>القوة المحصلة تغيّر الحركة</h3>
          <p>
            لا نبدأ من القانون مباشرة. نحدد القوى المؤثرة أولًا، ثم نحدد اتجاه القوة المحصلة. إذا كانت المحصلة
            غير صفرية، فإن سرعة الجسم أو اتجاهه سيتغيران.
          </p>
          <div className="agent-workspace-highlight">تذكّر: مجموع القوى يحدد التغير، وليس قوة واحدة معزولة.</div>
          <ol className="agent-workspace-step-list">
            <li>اكتب القوى الموجودة في الوضعية وارسم اتجاه كل واحدة.</li>
            <li>اجمع القوى على المحور نفسه، ثم انتبه إلى الإشارة.</li>
            <li>اربط النتيجة بالتسارع قبل كتابة الجواب النهائي.</li>
          </ol>
          <KnowledgeSources sources={sources} />
        </article>
      ) : (
        <article className="agent-workspace-exercise-card" data-testid="card-dalil-exercise">
          <span className="agent-workspace-panel-kicker">وكيل التمارين · جرّب قبل أن تسأل</span>
          <h3>حلّل حركة العربة على المسار</h3>
          <div className="agent-workspace-exercise-prompt">
            تؤثر في عربة قوة أفقية مقدارها 12 نيوتن، وتعاكسها قوة احتكاك مقدارها 4 نيوتن. ما اتجاه القوة
            المحصلة، وماذا تتوقع لحركة العربة؟
          </div>
          <textarea
            className="agent-workspace-exercise-answer"
            value={answer}
            onChange={(event) => onAnswerChange(event.target.value)}
            placeholder="اكتب خطواتك، وليس النتيجة فقط..."
            aria-label="إجابة التمرين"
            data-testid="input-dalil-exercise-answer"
          />
          {exerciseSubmitted && (
            <div className="agent-workspace-highlight" role="status" data-testid="status-exercise-submitted">
              سُجلت المحاولة. راجع اتجاه القوة المحصلة، ثم ناقش أي خطوة غير واضحة مع دليل.
            </div>
          )}
          {exerciseError && <div className="agent-workspace-chat-error" role="alert" data-testid="status-exercise-error">{exerciseError}</div>}
          <div className="agent-workspace-exercise-footer">
            <span>المحاولة تحفظ في سجل تعلمك</span>
            <button type="button" className="agent-workspace-send" onClick={onSubmitExercise} disabled={!answer.trim()} data-testid="button-submit-dalil-exercise">
              تحقق من المحاولة <Check size={14} />
            </button>
          </div>
        </article>
      )}
    </section>
  );
}

function DalilChat({
  messages,
  question,
  isSending,
  error,
  onQuestionChange,
  onSubmit,
}: {
  messages: ChatMessage[];
  question: string;
  isSending: boolean;
  error: string;
  onQuestionChange: (question: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <aside className="agent-workspace-chat" aria-label="محادثة دليل" data-testid="panel-dalil-chat">
      <div className="agent-workspace-chat-heading">
        <span className="agent-workspace-chat-avatar"><img src={owlAgentThinking} alt="دليل" /></span>
        <div>
          <strong>دليل</strong>
          <span>يفكك الفكرة ويربطها بالمنهاج</span>
        </div>
        <span className="agent-workspace-chat-status"><i /> متاح</span>
      </div>
      <div className="agent-workspace-chat-messages" aria-live="polite" data-testid="region-dalil-messages">
        {messages.map((message) => (
          <article className={`agent-workspace-chat-message ${message.role === 'user' ? 'is-user' : ''}`} key={message.id} data-testid={`message-dalil-${message.id}`}>
            <small>{message.role === 'user' ? 'أنت' : 'دليل'}</small>
            {message.text}
          </article>
        ))}
        {isSending && <article className="agent-workspace-chat-message" role="status" data-testid="status-dalil-thinking"><small>دليل</small>يبحث في مصادر الدرس...</article>}
      </div>
      {error && <div className="agent-workspace-chat-error" role="alert" data-testid="status-dalil-chat-error">{error}</div>}
      <form className="agent-workspace-chat-form" onSubmit={onSubmit}>
        <textarea
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="اسأل عن الخطوة التي لم تتضح..."
          aria-label="سؤال دليل"
          rows={2}
          data-testid="input-dalil-question"
        />
        <div className="agent-workspace-chat-footer">
          <span>إجابة مرتبطة بالدرس الحالي</span>
          <button type="submit" disabled={!question.trim() || isSending} data-testid="button-send-dalil-question">
            أرسل السؤال <Send size={13} />
          </button>
        </div>
      </form>
    </aside>
  );
}

function DalilExercisesPhase({
  orchestrator,
}: {
  orchestrator?: AgentOrchestratorState;
}) {
  const activeEntry = orchestrator?.entries.find((entry) => entry.status === 'ACTIVE') ?? orchestrator?.entries[0];
  const title = activeEntry?.title ?? 'قوانين نيوتن والحركة';
  const subject = activeEntry?.subject ?? 'العلوم الفيزيائية';
  const [mode, setMode] = useState<LearningMode>('explanation');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [chatError, setChatError] = useState('');
  const [exerciseError, setExerciseError] = useState('');
  const [exerciseSubmitted, setExerciseSubmitted] = useState(false);
  const knowledgeMutation = useQueryKnowledge();
  const attemptMutation = useRecordLearningAttempt();
  const sources = knowledgeMutation.data?.results ?? [];

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || knowledgeMutation.isPending) return;
    setChatError('');
    setMessages((current) => [...current, { id: `question-${Date.now()}`, role: 'user', text: nextQuestion }]);
    setQuestion('');
    knowledgeMutation.mutate(
      { data: { query: nextQuestion, n_results: 4, subject } },
      {
        onSuccess: (response) => {
          const firstSource = response.results[0];
          setMessages((current) => [...current, {
            id: `answer-${Date.now()}`,
            role: 'assistant',
            text: firstSource
              ? `${firstSource.summary} يمكنك الآن العودة إلى الخطوة المطلوبة وشرحها بكلماتك.`
              : 'لم أجد مصدرًا مباشرًا لهذه الصياغة. أعد كتابة السؤال بذكر القانون أو الوضعية التي تعمل عليها.',
          }]);
        },
        onError: () => {
          setChatError('تعذر الوصول إلى مصادر الدرس. جرّب صياغة السؤال مرة أخرى.');
        },
      },
    );
  };

  const submitExercise = () => {
    if (!answer.trim() || attemptMutation.isPending) return;
    setExerciseError('');
    setExerciseSubmitted(false);
    attemptMutation.mutate(
      {
        data: {
          lesson_id: activeEntry?.entry_id ?? 'newton-motion',
          lesson_title: title,
          concept_id: orchestrator?.learning.current_concept_ids[0] ?? 'motion-foundations',
          concept_title: 'القوة المحصلة',
          error_tag: 'dalil-exercise-review',
          is_correct: answer.trim().length > 20,
        },
      },
      {
        onSuccess: () => setExerciseSubmitted(true),
        onError: () => setExerciseError('تعذر حفظ المحاولة الآن. أبق إجابتك أمامك وحاول مرة أخرى.'),
      },
    );
  };

  return (
    <section className="agent-workspace-dalil-shell" aria-label="مرحلة دليل والتمارين" data-testid="panel-dalil-exercises-phase">
      <DalilContent
        mode={mode}
        title={title}
        subject={subject}
        answer={answer}
        exerciseSubmitted={exerciseSubmitted}
        exerciseError={exerciseError}
        sources={sources}
        onModeChange={setMode}
        onAnswerChange={(value) => { setAnswer(value); setExerciseSubmitted(false); }}
        onSubmitExercise={submitExercise}
      />
      <DalilChat
        messages={messages}
        question={question}
        isSending={knowledgeMutation.isPending}
        error={chatError}
        onQuestionChange={setQuestion}
        onSubmit={submitQuestion}
      />
    </section>
  );
}

export function AgentWorkspace({ entryDate, onOpenLesson }: AgentWorkspaceProps) {
  const [phase, setPhase] = useState<WorkspacePhase>('faheem');
  const hasManualSelection = useRef(false);
  const orchestratorQuery = useGetOrchestratorState(
    { entry_date: entryDate },
    { query: { queryKey: getGetOrchestratorStateQueryKey({ entry_date: entryDate }), refetchInterval: 10_000 } },
  );
  const orchestrator = orchestratorQuery.data;
  const stateMachineQuery = useGetOrchestratorStateMachine({
    query: {
      queryKey: getGetOrchestratorStateMachineQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const stateMachine = stateMachineQuery.data;
  const activeAgent = orchestrator?.active_agent;
  const activeEntry = useMemo(
    () => stateMachine?.entries.find((entry) => entry.status === 'ACTIVE') ?? stateMachine?.entries[0],
    [stateMachine?.entries],
  );

  useEffect(() => {
    if (!stateMachine || hasManualSelection.current) return;
    const faheemIsActive = stateMachine.agent_availability.faheem === 'ACTIVE';
    const partnerIsActive = stateMachine.agent_availability.daleel === 'ACTIVE'
      || stateMachine.agent_availability.exercises === 'ACTIVE';
    setPhase(faheemIsActive || !partnerIsActive ? 'faheem' : 'dalil-exercises');
  }, [stateMachine]);

  const selectPhase = (nextPhase: WorkspacePhase) => {
    hasManualSelection.current = true;
    setPhase(nextPhase);
  };

  return (
    <section className="agent-workspace" dir="rtl" data-testid="agent-workspace">
      <header className="agent-workspace-header">
        <div className="agent-workspace-heading">
          <AgentAvatar phase={phase} />
          <div>
            <span className="agent-workspace-kicker"><Sparkles size={12} /> مساحة الوكلاء · {formatEntryDate(entryDate)}</span>
            <h1>جلسة تعلم واضحة، من أول سؤال إلى آخر خطوة.</h1>
            <p>تتبدل مساحة العمل حسب ما تحتاجه الآن. الوكيل النشط ظاهر، والانتقال التالي قريب منك.</p>
          </div>
        </div>
        <div className="agent-workspace-agent" aria-label="الوكيل النشط" data-testid="status-active-agent">
          <div className="agent-workspace-agent-copy">
            <span className="agent-workspace-live"><i /> متصل الآن</span>
            <strong>{agentLabel(activeAgent)}</strong>
            <span>{activeEntry?.title ?? 'جلسة التعلم الحالية'}</span>
          </div>
        </div>
      </header>
      <div className="agent-workspace-switcher" role="tablist" aria-label="اختيار مرحلة مساحة الوكلاء">
        <button
          type="button"
          role="tab"
          aria-selected={phase === 'faheem'}
          className={`agent-workspace-switch ${phase === 'faheem' ? 'is-active' : ''}`}
          onClick={() => selectPhase('faheem')}
          data-testid="button-agent-phase-faheem"
        >
          <Sparkles size={15} /> فهيم <small>فهم وتثبيت</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={phase === 'dalil-exercises'}
          className={`agent-workspace-switch ${phase === 'dalil-exercises' ? 'is-active' : ''}`}
          onClick={() => selectPhase('dalil-exercises')}
          data-testid="button-agent-phase-dalil-exercises"
        >
          <Lightbulb size={15} /> دليل والتمارين <small>شرح وتطبيق</small>
        </button>
      </div>
      {(orchestratorQuery.isError || stateMachineQuery.isError) && (
        <div className="agent-workspace-error" role="alert" data-testid="status-agent-workspace-error">
          <span><CircleAlert size={14} /> تعذر تحديث قرار الوكلاء. يمكنك متابعة الجلسة بالبيانات الأخيرة.</span>
          <button
            type="button"
            onClick={() => {
              void orchestratorQuery.refetch();
              void stateMachineQuery.refetch();
            }}
            data-testid="button-retry-agent-workspace"
          >
            <RefreshCw size={13} /> إعادة المحاولة
          </button>
        </div>
      )}
      <div className="agent-workspace-status" role="status" data-testid="status-agent-workspace-phase">
        <span><MessageCircle size={13} /> المرحلة المختارة</span>
        <strong>{phase === 'faheem' ? 'فهيم · مسار الإتقان والسبورة' : 'دليل ووكيل التمارين · شرح وتطبيق'}</strong>
      </div>
      {orchestratorQuery.isLoading || stateMachineQuery.isLoading ? (
        <WorkspaceLoading />
      ) : phase === 'faheem' ? (
        <FaheemPhase onOpenLesson={onOpenLesson} />
      ) : (
        <DalilExercisesPhase orchestrator={stateMachine} />
      )}
    </section>
  );
}