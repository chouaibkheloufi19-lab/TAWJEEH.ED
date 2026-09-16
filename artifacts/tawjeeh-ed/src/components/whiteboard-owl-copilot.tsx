import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowUpRight,
  BrainCircuit,
  CircleDot,
  Grip,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  Move,
  Send,
  Sparkles,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import owlAgentMint from '@assets/agent-guiding-cropped.png';
import owlAgentTeal from '@assets/agent-creation-cropped.png';
import owlAgentViolet from '@assets/agent-thinking-cropped.png';
import { MathText } from '@/components/math-text';

export type WhiteboardOwlState = 'idle' | 'speaking' | 'listening' | 'moving' | 'thinking';

/**
 * A normalized rectangle inside the whiteboard. Values are fractions from 0 to 1,
 * which lets the copilot stay attached to a selection while the board resizes.
 */
export type WhiteboardOwlTarget = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WhiteboardOwlCopilotProps = {
  state?: WhiteboardOwlState;
  target?: WhiteboardOwlTarget | null;
  open?: boolean;
  defaultOpen?: boolean;
  disabled?: boolean;
  title?: string;
  message?: string;
  actionLabel?: string;
  imageSrc?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onAsk?: () => void;
  onDismiss?: () => void;
  question?: string;
  onQuestionChange?: (question: string) => void;
  onSubmitQuestion?: () => void;
  onToggleVoice?: () => void;
  isListening?: boolean;
  answer?: string;
  error?: string;
  isAsking?: boolean;
};

type StateCopy = {
  label: string;
  detail: string;
  icon: LucideIcon;
  asset: string;
};

const stateCopy: Record<WhiteboardOwlState, StateCopy> = {
  idle: {
    label: 'جاهز معك',
    detail: 'بانتظار سؤالك',
    icon: Sparkles,
    asset: owlAgentTeal,
  },
  speaking: {
    label: 'يشرح الآن',
    detail: 'شرح مرتبط بتحديدك',
    icon: Volume2,
    asset: owlAgentMint,
  },
  listening: {
    label: 'أستمع',
    detail: 'تحدث عن الجزء المحدد',
    icon: Mic,
    asset: owlAgentTeal,
  },
  moving: {
    label: 'أقترب من التحديد',
    detail: 'أنتقل إلى الجزء الذي اخترته',
    icon: Move,
    asset: owlAgentMint,
  },
  thinking: {
    label: 'أرتب الفكرة',
    detail: 'أصل التحديد بمفهوم الدرس',
    icon: BrainCircuit,
    asset: owlAgentViolet,
  },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function normalizeTarget(target: WhiteboardOwlTarget) {
  const x = clamp(target.x, 0, 1);
  const y = clamp(target.y, 0, 1);
  const width = clamp(target.width, 0, 1 - x);
  const height = clamp(target.height, 0, 1 - y);
  return {
    x,
    y,
    width,
    height,
    centerX: clamp(x + width / 2, 0.12, 0.88),
    centerY: clamp(y + height / 2, 0.15, 0.82),
  };
}

export function WhiteboardOwlCopilot({
  state = 'idle',
  target = null,
  open: controlledOpen,
  defaultOpen = true,
  disabled = false,
  title = 'فهيم على السبورة',
  message,
  actionLabel = 'اسأل عن هذا الجزء',
  imageSrc,
  className = '',
  onOpenChange,
  onAsk,
  onDismiss,
  question = '',
  onQuestionChange,
  onSubmitQuestion,
  onToggleVoice,
  isListening = false,
  answer = '',
  error = '',
  isAsking = false,
}: WhiteboardOwlCopilotProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const didDragRef = useRef(false);
  const isOpen = controlledOpen ?? internalOpen;
  const copy = stateCopy[state];
  const StateIcon = copy.icon;
  const targetBox = target ? normalizeTarget(target) : null;
  const visualMessage = message ?? (
    target
      ? 'أرى المنطقة التي حددتها. افتح السؤال عندما تريد أن نفككها معًا.'
      : 'حدد جزءًا من اللوح، وسأساعدك على قراءته خطوة بخطوة.'
  );

  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    setDragPosition(null);
  }, [target?.x, target?.y, target?.width, target?.height]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const position = dragPosition ?? {
    x: targetBox?.centerX ?? 0.84,
    y: targetBox?.centerY ?? 0.79,
  };
  const positionStyle = {
    '--owl-x': `${position.x * 100}%`,
    '--owl-y': `${position.y * 100}%`,
  } as CSSProperties;

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0 || !rootRef.current) return;
    const bounds = rootRef.current.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left - position.x * bounds.width,
      offsetY: event.clientY - bounds.top - position.y * bounds.height,
    };
    didDragRef.current = false;
    setIsDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !bounds) return;
    const nextX = clamp((event.clientX - bounds.left - drag.offsetX) / bounds.width, 0.08, 0.92);
    const nextY = clamp((event.clientY - bounds.top - drag.offsetY) / bounds.height, 0.1, 0.88);
    if (Math.abs(nextX - position.x) > 0.005 || Math.abs(nextY - position.y) > 0.005) {
      didDragRef.current = true;
      setDragPosition({ x: nextX, y: nextY });
    }
  };

  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleOrbClick = () => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setOpen(!isOpen);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitQuestion?.();
  };

  return (
    <div
      ref={rootRef}
      className={`whiteboard-owl-copilot ${targetBox ? 'has-target' : ''} state-${state} ${disabled ? 'is-disabled' : ''} ${isDragging ? 'is-dragging' : ''} ${className}`}
      dir="rtl"
      onKeyDown={handleKeyDown}
      aria-labelledby={headingId}
      data-testid="whiteboard-owl-copilot"
    >
      {targetBox && (
        <div
          className="whiteboard-owl-target-frame"
          style={{
            left: `${targetBox.x * 100}%`,
            top: `${targetBox.y * 100}%`,
            width: `${targetBox.width * 100}%`,
            height: `${targetBox.height * 100}%`,
          }}
          aria-hidden="true"
          data-testid="whiteboard-owl-target-frame"
        >
          <span />
        </div>
      )}

      <div className="whiteboard-owl-shell" style={positionStyle}>
        <div className="whiteboard-owl-aura" aria-hidden="true" />
        <button
          type="button"
          className="whiteboard-owl-orb"
          onClick={handleOrbClick}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          aria-expanded={isOpen}
          aria-controls={headingId}
          aria-label={isOpen ? 'تصغير مساعد السبورة أو سحبها' : 'فتح مساعد السبورة أو سحبها'}
          disabled={disabled}
          data-testid="button-toggle-whiteboard-owl"
        >
          <span className="whiteboard-owl-drag-hint" aria-hidden="true"><Grip size={12} /></span>
          <span className="whiteboard-owl-orb-ring" aria-hidden="true" />
          <img src={imageSrc ?? copy.asset} alt="" />
          <span className="whiteboard-owl-state-dot" aria-hidden="true">
            <StateIcon size={11} strokeWidth={2.6} />
          </span>
        </button>

        {isOpen && (
          <section
            id={headingId}
            className="whiteboard-owl-panel"
            role="dialog"
            aria-label={title}
            data-testid="panel-whiteboard-owl"
          >
            <header className="whiteboard-owl-panel-header">
              <div className="whiteboard-owl-mini-mark" aria-hidden="true">
                <CircleDot size={14} />
              </div>
              <div className="whiteboard-owl-title">
                <span>{title}</span>
                <strong>{copy.label}</strong>
              </div>
              <button
                type="button"
                className="whiteboard-owl-close"
                onClick={() => {
                  setOpen(false);
                  onDismiss?.();
                }}
                aria-label="إغلاق مساعد السبورة"
                data-testid="button-dismiss-whiteboard-owl"
              >
                <X size={15} />
              </button>
            </header>

            <div className="whiteboard-owl-state" aria-live="polite" data-testid="status-whiteboard-owl">
              <StateIcon size={14} aria-hidden="true" />
              <span>{copy.detail}</span>
              <i aria-hidden="true" />
            </div>

            <p className="whiteboard-owl-message"><MathText>{visualMessage}</MathText></p>

            {targetBox && (
              <div className="whiteboard-owl-selection-note">
                <MessageCircle size={14} aria-hidden="true" />
                <span>تم تثبيت الحديث على الجزء المحدد</span>
              </div>
            )}

            {onSubmitQuestion ? (
              <form className="whiteboard-owl-question-form" onSubmit={handleSubmit}>
                <label htmlFor={`${headingId}-question`}>ما الذي تريد فهمه؟</label>
                <textarea
                  id={`${headingId}-question`}
                  value={question}
                  onChange={(event) => onQuestionChange?.(event.target.value)}
                  placeholder="مثال: لماذا يتغير الميل هنا؟"
                  rows={3}
                  disabled={disabled || isAsking}
                  data-testid="input-whiteboard-owl-question"
                />
                <div className="whiteboard-owl-question-actions">
                  {onToggleVoice && (
                    <button
                      type="button"
                      className={isListening ? 'is-listening' : ''}
                      onClick={onToggleVoice}
                      disabled={disabled || isAsking}
                      aria-label={isListening ? 'إيقاف الإملاء الصوتي' : 'إملاء السؤال صوتيًا'}
                    >
                      {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={disabled || isAsking || !question.trim()}
                    data-testid="button-submit-whiteboard-owl-question"
                  >
                    {isAsking ? <LoaderCircle size={14} className="lesson-spin-icon" /> : <Send size={14} />}
                    <span>{isAsking ? 'يفكر...' : 'اسأل فهيم'}</span>
                  </button>
                </div>
              </form>
            ) : onAsk ? (
              <button
                type="button"
                className="whiteboard-owl-ask"
                onClick={onAsk}
                disabled={disabled || state === 'thinking' || state === 'moving'}
                data-testid="button-ask-whiteboard-owl"
              >
                <span>{actionLabel}</span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            ) : null}

            {error && <p className="whiteboard-owl-error" role="alert">{error}</p>}
            {answer && <div className="whiteboard-owl-answer" role="status"><strong>الإجابة</strong><p><MathText>{answer}</MathText></p></div>}

            <footer className="whiteboard-owl-panel-footer">
              <span><Mic size={12} aria-hidden="true" /> يدعم السؤال الصوتي</span>
              <span className="whiteboard-owl-shortcut"><kbd>Esc</kbd> تصغير</span>
            </footer>
          </section>
        )}
      </div>
    </div>
  );
}
