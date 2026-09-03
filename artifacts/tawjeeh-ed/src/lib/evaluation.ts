export type EvaluationMode = 'fixed-foundation' | 'adaptive-accelerated';
export type ActiveAgent = 'faheem' | 'dalil-exercises';

export type EvaluationPlan = {
  mode: EvaluationMode;
  activeAgent: ActiveAgent;
  title: string;
  description: string;
  durationLabel: string;
  durationDays: number | null;
  windowLabel: string;
};

const PRIOR_KNOWLEDGE_START_MONTH = 8;
const PRIOR_KNOWLEDGE_START_DAY = 1;
const PRIOR_KNOWLEDGE_END_MONTH = 9;
const PRIOR_KNOWLEDGE_END_DAY = 15;

export function isPriorKnowledgeWindow(date: Date) {
  const month = date.getMonth();
  const day = date.getDate();
  if (month === PRIOR_KNOWLEDGE_START_MONTH) return day >= PRIOR_KNOWLEDGE_START_DAY;
  if (month === PRIOR_KNOWLEDGE_END_MONTH) return day <= PRIOR_KNOWLEDGE_END_DAY;
  return false;
}

export function getEvaluationPlan(registrationAt: Date | string | null | undefined): EvaluationPlan {
  const registeredAt = registrationAt ? new Date(registrationAt) : new Date();
  const isFixedFoundation = !Number.isNaN(registeredAt.getTime()) && isPriorKnowledgeWindow(registeredAt);

  if (isFixedFoundation) {
    return {
      mode: 'fixed-foundation',
      activeAgent: 'faheem',
      title: 'تدارك للمكتسبات القبلية',
      description: 'مرحلة تأسيس وتقييم ثابتة لعشرة أيام، يقودها فهيم خطوة خطوة قبل التسليم.',
      durationLabel: '١٠ أيام ثابتة',
      durationDays: 10,
      windowLabel: 'نافذة بداية السنة · ١ سبتمبر — ١٥ أكتوبر',
    };
  }

  return {
    mode: 'adaptive-accelerated',
    activeAgent: 'faheem',
    title: 'تشخيص سريع وتدارك موجّه',
    description: 'تقييم مرن يسرّع اكتشاف خط الأساس، يعالج الفجوات الأهم، ثم يسلّمك مباشرة إلى المنهاج الجاري.',
    durationLabel: 'مدة مرنة',
    durationDays: null,
    windowLabel: 'تسجيل خلال السنة الدراسية',
  };
}

export function getEvaluationDay(startedAt: string, now = new Date()) {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 1;
  return Math.max(1, Math.floor(Math.max(0, now.getTime() - start) / 86_400_000) + 1);
}

export function canCompleteEvaluation(
  plan: EvaluationPlan,
  progress: number,
  startedAt: string,
  now = new Date(),
) {
  if (progress < 100) return false;
  if (plan.mode === 'adaptive-accelerated') return true;
  return getEvaluationDay(startedAt, now) >= (plan.durationDays ?? 10);
}

export function getEvaluationBlocker(
  plan: EvaluationPlan,
  progress: number,
  startedAt: string,
  now = new Date(),
) {
  if (progress < 100) return 'أكملي عناصر التشخيص العملية أولًا.';
  if (plan.mode === 'fixed-foundation') {
    const day = getEvaluationDay(startedAt, now);
    if (day < (plan.durationDays ?? 10)) return `هذه المرحلة ثابتة لعشرة أيام. ثبّتِ اليوم ${day}، ثم عودي في اليوم ١٠ لإتمام التسليم.`;
  }
  return '';
}