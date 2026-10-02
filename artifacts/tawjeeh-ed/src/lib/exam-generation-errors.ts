export type ExamApiErrorPayload = {
  message?: string;
  error?: string;
};

export function formatExamApiError(
  status: number,
  payload: ExamApiErrorPayload | null,
): string {
  switch (payload?.error) {
    case 'ai_provider_unavailable':
      return 'خدمة التوليد مشغولة الآن بسبب ضغط Gemini. أعد المحاولة بعد قليل؛ لم يُنشأ موضوع بديل.';
    case 'ai_connection_not_configured':
      return 'اتصال خدمة التوليد غير مهيأ. تحقّق من إعداد Gemini ثم أعد المحاولة.';
    case 'exam_generation_contract_failed':
      return 'تعذر مطابقة بنية الموضوع ودليل التصحيح حتى بعد محاولة إصلاح تلقائية؛ لم يُعتمد الموضوع. ضيّق المحور وبيّن عدد التمارين المطلوب.';
    case 'knowledge_retrieval_unavailable':
    case 'knowledge_sources_insufficient':
      return 'لم تكتمل قراءة مصادر المنهاج. أعد المحاولة بعد قليل.';
    default:
      if (payload?.message?.trim()) return payload.message.trim();
      if (status === 503) {
        return 'خدمة التوليد غير متاحة مؤقتًا بسبب ضغط Gemini. أعد المحاولة بعد قليل.';
      }
      if (status === 502) {
        return 'لم يكتمل توليد الموضوع من المصادر. أعد المحاولة بعد قليل.';
      }
      return 'تعذر تجهيز الموضوع من مصادر المعرفة. أعد المحاولة.';
  }
}