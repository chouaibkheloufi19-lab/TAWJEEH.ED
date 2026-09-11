import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  ArrowUpRight,
  BrainCircuit,
  CircleDot,
  MessageCircle,
  Mic,
  Move,
  Sparkles,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import owlAgentMint from '@assets/agent-guiding-cropped.png';
import owlAgentTeal from '@assets/agent-creation-cropped.png';
import owlAgentViolet from '@assets/agent-thinking-cropped.png';

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
}: WhiteboardOwlCopilotProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const headingId = useId();
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

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const positionStyle = {
    '--owl-x': `${targetBox?.centerX ? targetBox.centerX * 100 : 84}%`,
    '--owl-y': `${targetBox?.centerY ? targetBox.centerY * 100 : 79}%`,
  } as CSSProperties;

  return (
    <div
      className={`whiteboard-owl-copilot ${targetBox ? 'has-target' : ''} state-${state} ${disabled ? 'is-disabled' : ''} ${className}`}
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
          onClick={() => setOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={headingId}
          aria-label={isOpen ? 'تصغير مساعد السبورة' : 'فتح مساعد السبورة'}
          disabled={disabled}
          data-testid="button-toggle-whiteboard-owl"
        >
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

            <p className="whiteboard-owl-message">{visualMessage}</p>

            {targetBox && (
              <div className="whiteboard-owl-selection-note">
                <MessageCircle size={14} aria-hidden="true" />
                <span>تم تثبيت الحديث على الجزء المحدد</span>
              </div>
            )}

            {onAsk && (
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
            )}

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
