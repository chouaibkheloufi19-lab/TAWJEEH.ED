import { useCallback, useEffect, useRef, useState } from 'react';
import type { OwlBoundingBox } from '@/components/OwlCopilot';
import { fetchWithTimeout } from '@/lib/request';

export type OwlSelectionPayload = {
  imageDataUrl: string;
  bounds: OwlBoundingBox;
  prompt: string;
  lessonId?: string;
};

export type OwlAnswer = {
  answer: string;
  speechText?: string;
  audioUrl?: string;
};

export type OwlSyncState = 'idle' | 'thinking' | 'explaining' | 'error';

export type OwlBoardSyncEvent =
  | { type: 'tts:start'; durationMs?: number }
  | { type: 'tts:progress'; progress: number }
  | { type: 'tts:end' }
  | { type: 'board:step'; step: number };

export type UseOwlSyncOptions = {
  endpoint?: string;
  lessonId?: string;
  onBoardEvent?: (event: OwlBoardSyncEvent) => void;
};

type TtsEventDetail = OwlBoardSyncEvent & { source?: string };

/**
 * Owns the request boundary and the browser event bridge used by TTS/board
 * animation. The API response is intentionally normalized here so UI code
 * does not depend on provider-specific response envelopes.
 */
export function useOwlSync({
  endpoint = '/api/ai/explain-selection',
  lessonId,
  onBoardEvent,
}: UseOwlSyncOptions = {}) {
  const [status, setStatus] = useState<OwlSyncState>('idle');
  const [answer, setAnswer] = useState<OwlAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boardStep, setBoardStep] = useState(0);
  const [ttsProgress, setTtsProgress] = useState(0);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleSyncEvent = (event: Event) => {
      const detail = (event as CustomEvent<TtsEventDetail>).detail;
      if (!detail?.type || detail.source === 'owl-sync') return;
      if (detail.type === 'tts:progress') setTtsProgress(Math.min(1, Math.max(0, detail.progress)));
      if (detail.type === 'tts:start') setTtsProgress(0);
      if (detail.type === 'tts:end') setTtsProgress(1);
      if (detail.type === 'board:step') setBoardStep(Math.max(0, detail.step));
      onBoardEvent?.(detail);
    };
    window.addEventListener('owl:sync', handleSyncEvent);
    return () => window.removeEventListener('owl:sync', handleSyncEvent);
  }, [onBoardEvent]);

  const askAboutSelection = useCallback(async (payload: OwlSelectionPayload) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('thinking');
    setError(null);
    setAnswer(null);
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, lessonId: payload.lessonId ?? lessonId }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as {
        answer?: string;
        speech_text?: string;
        speechText?: string;
        audio_url?: string;
        audioUrl?: string;
        message?: string;
      } | null;
      if (!response.ok) throw new Error(body?.message || 'تعذر الحصول على شرح الآن.');
      if (!body?.answer) throw new Error('وصلت إجابة غير مكتملة من المساعد.');
      const nextAnswer = {
        answer: body.answer,
        speechText: body.speechText ?? body.speech_text,
        audioUrl: body.audioUrl ?? body.audio_url,
      };
      setAnswer(nextAnswer);
      setStatus('explaining');
      return nextAnswer;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return null;
      const message = requestError instanceof Error ? requestError.message : 'حدث خطأ غير متوقع.';
      setError(message);
      setStatus('error');
      return null;
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [endpoint, lessonId]);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setStatus('idle');
    setAnswer(null);
    setError(null);
    setBoardStep(0);
    setTtsProgress(0);
  }, []);

  return {
    status,
    answer,
    error,
    boardStep,
    ttsProgress,
    askAboutSelection,
    reset,
  };
}

/** Dispatch from an audio/TTS controller to keep whiteboard effects in sync. */
export function emitOwlSyncEvent(event: OwlBoardSyncEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TtsEventDetail>('owl:sync', {
    detail: { ...event, source: 'owl-sync' },
  }));
}
