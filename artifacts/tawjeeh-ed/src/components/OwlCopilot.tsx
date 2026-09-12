import {
  BrainCircuit,
  Grip,
  MessageCircle,
  Move,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';

export type OwlCopilotState = 'Idle' | 'Explaining' | 'Thinking' | 'Moving';

export type OwlBoundingBox = {
  /** Normalized values (0–1) relative to the whiteboard viewport. */
  x: number;
  y: number;
  width: number;
  height: number;
};

type OwlPosition = { x: number; y: number };

type OwlCopilotProps = {
  state?: OwlCopilotState;
  target?: OwlBoundingBox | null;
  open?: boolean;
  defaultOpen?: boolean;
  disabled?: boolean;
  message?: string;
  imageSrc?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onAsk?: () => void;
};

const COPY: Record<OwlCopilotState, { label: string; detail: string }> = {
  Idle: { label: 'جاهز معك', detail: 'حدد شيئًا وسأساعدك' },
  Explaining: { label: 'يشرح الآن', detail: 'أفكك الفكرة خطوة بخطوة' },
  Thinking: { label: 'يفكر', detail: 'أرتب الإجابة المناسبة' },
  Moving: { label: 'يتحرك إلى التحديد', detail: 'أقترب من موضع سؤالك' },
};

const ICONS = {
  Idle: Sparkles,
  Explaining: Volume2,
  Thinking: BrainCircuit,
  Moving: Move,
} satisfies Record<OwlCopilotState, typeof Sparkles>;

const DEFAULT_POSITION = { x: 24, y: 24 };
const OWL_SIZE = 76;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeBox(box: OwlBoundingBox) {
  const x = clamp(box.x, 0, 1);
  const y = clamp(box.y, 0, 1);
  const width = clamp(box.width, 0, 1 - x);
  const height = clamp(box.height, 0, 1 - y);
  return {
    x,
    y,
    width,
    height,
    centerX: clamp(x + width / 2, 0.08, 0.92),
    centerY: clamp(y + height / 2, 0.12, 0.88),
  };
}

/**
 * Floating Blue Owl companion. The target is normalized so the same component
 * works over a responsive canvas; dragging remains available as a manual override.
 */
export function OwlCopilot({
  state = 'Idle',
  target = null,
  open: controlledOpen,
  defaultOpen = true,
  disabled = false,
  message = 'حدد أي جزء من الدرس، وسأشرح لك الفكرة ببساطة.',
  imageSrc = owlLogoPath,
  className = '',
  onOpenChange,
  onAsk,
}: OwlCopilotProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [position, setPosition] = useState<OwlPosition>(DEFAULT_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const isOpen = controlledOpen ?? internalOpen;
  const box = target ? normalizeBox(target) : null;
  const Icon = ICONS[state];
  const copy = COPY[state];

  const clampPosition = useCallback((next: OwlPosition) => {
    const host = document.querySelector<HTMLElement>('[data-owl-copilot-host]');
    if (!host) return next;
    return {
      x: clamp(next.x, 8, Math.max(8, host.clientWidth - OWL_SIZE - 8)),
      y: clamp(next.y, 8, Math.max(8, host.clientHeight - OWL_SIZE - 8)),
    };
  }, []);

  useEffect(() => {
    if (!box || isDragging) return;
    const host = document.querySelector<HTMLElement>('[data-owl-copilot-host]');
    if (!host) return;
    setPosition(clampPosition({
      x: box.centerX * host.clientWidth - OWL_SIZE / 2,
      y: box.centerY * host.clientHeight - OWL_SIZE / 2,
    }));
  }, [box?.centerX, box?.centerY, clampPosition, isDragging]);

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPosition]);

  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
    setIsDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }));
  };

  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
  };

  const style = {
    '--owl-left': `${position.x}px`,
    '--owl-top': `${position.y}px`,
    '--owl-target-left': `${(box?.x ?? 0) * 100}%`,
    '--owl-target-top': `${(box?.y ?? 0) * 100}%`,
    '--owl-target-width': `${(box?.width ?? 0) * 100}%`,
    '--owl-target-height': `${(box?.height ?? 0) * 100}%`,
  } as CSSProperties;

  return (
    <div
      className={`owl-copilot-layer state-${state.toLowerCase()} ${isDragging ? 'is-dragging' : ''} ${className}`}
      style={style}
      dir="rtl"
      aria-label="مساعد البومة فهيم"
      data-testid="owl-copilot"
    >
      {box && <div className="owl-target-box" aria-hidden="true" />}
      <div className="owl-copilot-float">
        <button
          type="button"
          className="owl-drag-handle"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          aria-label="اسحب البومة إلى مكان آخر"
          title="اسحب لتغيير المكان"
          disabled={disabled}
        >
          <Grip size={14} />
        </button>
        <button
          type="button"
          className="owl-copilot-orb"
          onClick={() => setOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'تصغير مساعد البومة' : 'فتح مساعد البومة'}
          disabled={disabled}
        >
          <img src={imageSrc} alt="" />
          <span className="owl-state-icon"><Icon size={13} /></span>
        </button>
        {isOpen && (
          <section className="owl-copilot-panel" role="dialog" aria-label="مساعد البومة">
            <header>
              <div className="owl-panel-title">
                <span><Sparkles size={13} /> فهيم على السبورة</span>
                <strong>{copy.label}</strong>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق">
                <X size={15} />
              </button>
            </header>
            <div className="owl-panel-status" aria-live="polite">
              <Icon size={14} />
              <span>{copy.detail}</span>
            </div>
            <p>{message}</p>
            {onAsk && (
              <button type="button" className="owl-ask-button" onClick={onAsk} disabled={disabled || state === 'Thinking' || state === 'Moving'}>
                <MessageCircle size={15} />
                <span>اسأل عن هذا الجزء</span>
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
