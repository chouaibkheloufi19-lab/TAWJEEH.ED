import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  BookOpen,
  BrainCircuit,
  Compass,
  Grip,
  MessageCircle,
  Minus,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { getOwlAgent, owlAgentIds, owlAgents, type OwlAgentId } from '@/config/owlAgents';

type WidgetPosition = {
  x: number;
  y: number;
};

type DynamicOwlCopilotProps = {
  initialAgent?: OwlAgentId;
  activeAgent?: OwlAgentId;
  onAgentChange?: (agent: OwlAgentId) => void;
  storageKey?: string;
};

const POSITION_STORAGE_KEY = 'tawjeeh.owl-copilot.position.v1';
const OPEN_STORAGE_KEY = 'tawjeeh.owl-copilot.open.v1';
const EDGE_GUTTER = 16;
const WIDGET_WIDTH = 344;
const WIDGET_HEIGHT = 248;

const agentIcons: Record<OwlAgentId, typeof Compass> = {
  WELCOME: Compass,
  FAHIM: BrainCircuit,
  DALEEL: BookOpen,
  PRACTICE: Target,
};

function defaultPosition(): WidgetPosition {
  if (typeof window === 'undefined') return { x: EDGE_GUTTER, y: EDGE_GUTTER };
  return {
    x: Math.max(EDGE_GUTTER, window.innerWidth - WIDGET_WIDTH - 32),
    y: Math.max(EDGE_GUTTER, window.innerHeight - WIDGET_HEIGHT - 32),
  };
}

function clampPosition(position: WidgetPosition): WidgetPosition {
  if (typeof window === 'undefined') return position;
  return {
    x: Math.min(Math.max(EDGE_GUTTER, position.x), Math.max(EDGE_GUTTER, window.innerWidth - WIDGET_WIDTH - EDGE_GUTTER)),
    y: Math.min(Math.max(EDGE_GUTTER, position.y), Math.max(EDGE_GUTTER, window.innerHeight - WIDGET_HEIGHT - EDGE_GUTTER)),
  };
}

function readPosition(storageKey: string): WidgetPosition {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '');
    if (typeof saved?.x === 'number' && typeof saved?.y === 'number') return clampPosition(saved);
  } catch {
    // Ignore malformed local widget state and restore the default position.
  }
  return defaultPosition();
}

function readOpenState(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function DynamicOwlCopilot({
  initialAgent = 'FAHIM',
  activeAgent: controlledAgent,
  onAgentChange,
  storageKey = POSITION_STORAGE_KEY,
}: DynamicOwlCopilotProps) {
  const [internalAgent, setInternalAgent] = useState<OwlAgentId>(initialAgent);
  const [isOpen, setIsOpen] = useState(readOpenState);
  const [position, setPosition] = useState<WidgetPosition>(() => readPosition(storageKey));
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const activeId = controlledAgent ?? internalAgent;
  const agent = getOwlAgent(activeId);
  const Icon = agentIcons[agent.id];
  const themeStyle = useMemo(
    () =>
      ({
        '--owl-accent': agent.theme.accent,
        '--owl-accent-strong': agent.theme.accentStrong,
        '--owl-accent-soft': agent.theme.accentSoft,
        '--owl-surface': agent.theme.surface,
        '--owl-border': agent.theme.border,
        '--owl-text': agent.theme.text,
        '--owl-glow': agent.theme.glow,
        left: `${position.x}px`,
        top: `${position.y}px`,
      }) as CSSProperties,
    [agent, position],
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(position));
    } catch {
      // Position persistence is an enhancement; the widget remains usable if storage is unavailable.
    }
  }, [position, storageKey]);

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, String(isOpen));
    } catch {
      // Ignore storage restrictions.
    }
  }, [isOpen]);

  const chooseAgent = (nextAgent: OwlAgentId) => {
    if (!controlledAgent) setInternalAgent(nextAgent);
    onAgentChange?.(nextAgent);
  };

  const startDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
    setIsDragging(true);
  };

  const moveWidget = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }));
  };

  const stopDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
  };

  return (
    <aside
      className={`owl-copilot ${isOpen ? 'is-open' : 'is-collapsed'} ${isDragging ? 'is-dragging' : ''}`}
      style={themeStyle}
      dir="rtl"
      aria-label={`مساعد ${agent.displayName}`}
      data-testid="dynamic-owl-copilot"
    >
      <button
        type="button"
        className="owl-copilot-drag-handle"
        onPointerDown={startDragging}
        onPointerMove={moveWidget}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        aria-label="اسحب لتغيير مكان مساعد البومة"
        title="اسحب لتغيير المكان"
        data-testid="button-drag-owl-copilot"
      >
        <Grip size={16} />
      </button>
      <div className="owl-copilot-orb" aria-hidden="true">
        <img src={agent.asset} alt="" />
        <span />
      </div>
      {isOpen ? (
        <section className="owl-copilot-card">
          <header className="owl-copilot-header">
            <div className="owl-copilot-agent-mark">
              <Icon size={16} />
            </div>
            <div className="owl-copilot-heading">
              <span>المساعد النشط</span>
              <strong>{agent.displayName}</strong>
              <small>{agent.role}</small>
            </div>
            <div className="owl-copilot-actions">
              <button type="button" onClick={() => setIsOpen(false)} aria-label="تصغير مساعد البومة" data-testid="button-minimize-owl-copilot">
                <Minus size={16} />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="إغلاق مساعد البومة" data-testid="button-close-owl-copilot">
                <X size={16} />
              </button>
            </div>
          </header>
          <p className="owl-copilot-description">{agent.description}</p>
          <div className="owl-copilot-responsibilities" aria-label="مسؤوليات المساعد">
            {agent.responsibilities.map((responsibility) => (
              <span key={responsibility}><Sparkles size={11} /> {responsibility}</span>
            ))}
          </div>
          <div className="owl-copilot-switcher" role="list" aria-label="تبديل مساعد البومة">
            {owlAgentIds.map((id) => {
              const option = owlAgents[id];
              const OptionIcon = agentIcons[id];
              const selected = id === agent.id;
              return (
                <button
                  type="button"
                  key={id}
                  className={selected ? 'is-active' : ''}
                  onClick={() => chooseAgent(id)}
                  aria-label={`تفعيل ${option.displayName}`}
                  aria-pressed={selected}
                  data-testid={`button-owl-agent-${id.toLowerCase()}`}
                >
                  <OptionIcon size={14} />
                  <span>{option.displayName}</span>
                </button>
              );
            })}
          </div>
          <div className="owl-copilot-footer">
            <MessageCircle size={13} />
            <span>اسأل المساعد النشط عن خطوتك التالية</span>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="owl-copilot-collapsed-button"
          onClick={() => setIsOpen(true)}
          aria-label={`فتح مساعد ${agent.displayName}`}
          data-testid="button-open-owl-copilot"
        >
          <img src={agent.asset} alt="" />
          <span><strong>{agent.displayName}</strong><small>{agent.role}</small></span>
          <Icon size={16} />
        </button>
      )}
    </aside>
  );
}