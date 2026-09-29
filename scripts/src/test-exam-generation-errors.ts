import assert from 'node:assert/strict';
import { formatExamApiError } from '../../artifacts/tawjeeh-ed/src/lib/exam-generation-errors';

const geminiBusyMessage =
  'خدمة التوليد مشغولة الآن بسبب ضغط Gemini. أعد المحاولة بعد قليل؛ لم يُنشأ موضوع بديل.';

assert.equal(
  formatExamApiError(503, {
    error: 'ai_provider_unavailable',
    message: 'رسالة خادم عامة لا ينبغي أن تحجب الرسالة المخصصة.',
  }),
  geminiBusyMessage,
);

assert.equal(
  formatExamApiError(502, { error: 'exam_generation_contract_failed' }),
  'وصل رد التوليد لكنه لم يطابق بنية الموضوع ودليل التصحيح. أعد المحاولة.',
);

assert.equal(
  formatExamApiError(424, { error: 'knowledge_sources_insufficient' }),
  'لم تكتمل قراءة مصادر المنهاج. أعد المحاولة بعد قليل.',
);

assert.equal(
  formatExamApiError(400, { message: 'رسالة خادم مخصصة.' }),
  'رسالة خادم مخصصة.',
);

console.log('Exam generation error messaging checks passed.');