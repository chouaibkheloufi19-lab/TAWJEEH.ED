import owlAgentGold from '@assets/agent-success-cropped.png';
import owlAgentMint from '@assets/agent-guiding-cropped.png';
import owlAgentTeal from '@assets/agent-creation-cropped.png';
import owlAgentViolet from '@assets/agent-thinking-cropped.png';

export type OwlAgentId = 'WELCOME' | 'FAHIM' | 'DALEEL' | 'PRACTICE';

export type OwlAgentTheme = {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  surface: string;
  border: string;
  text: string;
  glow: string;
};

export type OwlAgentConfig = {
  id: OwlAgentId;
  name: string;
  displayName: string;
  role: string;
  description: string;
  responsibilities: string[];
  asset: string;
  theme: OwlAgentTheme;
};

export const owlAgents: Record<OwlAgentId, OwlAgentConfig> = {
  WELCOME: {
    id: 'WELCOME',
    name: 'Navigator Owl',
    displayName: 'بومة الاستقبال',
    role: 'الملاحة والتعريف',
    description: 'يرتب لك بداية واضحة ويعرّفك بمساحة توجيه خطوة بخطوة.',
    responsibilities: ['تهيئة الحساب', 'جولات النظام', 'اقتراح نقطة البداية'],
    asset: owlAgentMint,
    theme: {
      accent: '#536dfe',
      accentStrong: '#304ffe',
      accentSoft: '#eef0ff',
      surface: '#f7f8ff',
      border: '#c9d0ff',
      text: '#26347a',
      glow: 'rgba(83, 109, 254, .28)',
    },
  },
  FAHIM: {
    id: 'FAHIM',
    name: 'Fahim',
    displayName: 'فَهيم',
    role: 'التشخيص والتكيّف',
    description: 'يقيس مستواك، يكيّف برنامجك، ويجيبك على لوحة تفاعلية.',
    responsibilities: ['التشخيص الأولي لعشرة أيام', 'الجدولة التكيفية', 'أسئلة وأجوبة على اللوحة'],
    asset: owlAgentTeal,
    theme: {
      accent: '#22d3ee',
      accentStrong: '#0284c7',
      accentSoft: '#e8fbff',
      surface: '#f4fcff',
      border: '#a5eaf5',
      text: '#075985',
      glow: 'rgba(34, 211, 238, .3)',
    },
  },
  DALEEL: {
    id: 'DALEEL',
    name: 'Daleel',
    displayName: 'دليل',
    role: 'الشرح والتدريس',
    description: 'يشرح الفكرة على اللوح الأبيض بصوت متزامن وخطوات مرئية.',
    responsibilities: ['شرح الدروس', 'الرسم المتدرج على اللوحة', 'مزامنة الصوت مع الشرح'],
    asset: owlAgentViolet,
    theme: {
      accent: '#10b981',
      accentStrong: '#047857',
      accentSoft: '#eafbf4',
      surface: '#f5fdf9',
      border: '#a7e7c9',
      text: '#065f46',
      glow: 'rgba(16, 185, 129, .28)',
    },
  },
  PRACTICE: {
    id: 'PRACTICE',
    name: 'Practice Owl',
    displayName: 'بومة التمارين',
    role: 'التمرين وبنك الأخطاء',
    description: 'يحوّل أخطاءك إلى تدريبات ومكدسات مركزة استعدادًا للبكالوريا.',
    responsibilities: ['توليد الكويزات', 'حساب نسب الخطأ', 'إدارة مكدسات الأخطاء'],
    asset: owlAgentGold,
    theme: {
      accent: '#f59e0b',
      accentStrong: '#c2410c',
      accentSoft: '#fff7e6',
      surface: '#fffaf1',
      border: '#f6d38a',
      text: '#92400e',
      glow: 'rgba(245, 158, 11, .3)',
    },
  },
};

export const owlAgentIds = Object.keys(owlAgents) as OwlAgentId[];

export const getOwlAgent = (id: OwlAgentId) => owlAgents[id] ?? owlAgents.FAHIM;