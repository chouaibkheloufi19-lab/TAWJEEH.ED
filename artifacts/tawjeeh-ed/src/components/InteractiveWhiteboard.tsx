import {
  ImagePlus,
  Mic,
  Paperclip,
  PenLine,
  ScanSearch,
  Send,
  Upload,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { OwlCopilot, type OwlBoundingBox } from '@/components/OwlCopilot';
import { useOwlSync } from '@/hooks/useOwlSync';
import owlLogoPath from '@assets/tawjeeh-owl-transparent.png';

export type WhiteboardTool = 'pen' | 'select';

type Point = { x: number; y: number };
type Selection = OwlBoundingBox & { imageDataUrl: string };

export type InteractiveWhiteboardProps = {
  lessonId?: string;
  title?: string;
  initialImage?: string;
  className?: string;
  onSelection?: (selection: Selection) => void;
  onUpload?: (file: File) => void;
};

function pointFromEvent(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function getBounds(start: Point, end: Point): OwlBoundingBox {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/**
 * Self-contained split lesson workspace. It owns canvas gestures and delegates
 * AI request state to useOwlSync; OwlCopilot only renders/moves the companion.
 */
export function InteractiveWhiteboard({
  lessonId,
  title = 'قوانين الحركة: قراءة الرسم البياني',
  initialImage,
  className = '',
  onSelection,
  onUpload,
}: InteractiveWhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<Point[]>([]);
  const selectionStartRef = useRef<Point | null>(null);
  const uploadedImageRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<WhiteboardTool>('select');
  const [draft, setDraft] = useState<OwlBoundingBox | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [question, setQuestion] = useState('');
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const owl = useOwlSync({ lessonId });

  const redraw = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#fbfdff';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(35, 92, 123, .08)';
    context.lineWidth = 1;
    for (let x = 24; x < width; x += 28) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    }
    for (let y = 24; y < height; y += 28) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
    const image = uploadedImageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      const scale = Math.min((width * .82) / image.naturalWidth, (height * .68) / image.naturalHeight, 1);
      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
      context.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    } else {
      context.fillStyle = '#075f70';
      context.font = '700 18px IBM Plex Sans Arabic, sans-serif';
      context.fillText('v = Δx / Δt', width * .18, height * .35);
      context.font = '600 12px IBM Plex Sans Arabic, sans-serif';
      context.fillText('الميل يروي قصة الحركة', width * .18, height * .43);
      context.strokeStyle = '#1b8596';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(width * .16, height * .78);
      context.lineTo(width * .84, height * .78);
      context.moveTo(width * .16, height * .78);
      context.lineTo(width * .16, height * .18);
      context.moveTo(width * .18, height * .7);
      context.bezierCurveTo(width * .36, height * .62, width * .51, height * .55, width * .77, height * .25);
      context.stroke();
    }
    context.strokeStyle = '#315c66';
    context.lineWidth = 3;
    context.lineCap = 'round';
    if (drawingRef.current.length > 1) {
      context.beginPath();
      context.moveTo(drawingRef.current[0].x * width, drawingRef.current[0].y * height);
      drawingRef.current.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
      context.stroke();
    }
    const current = draft ?? selection;
    if (current) {
      context.fillStyle = 'rgba(25, 168, 163, .11)';
      context.strokeStyle = '#159a99';
      context.lineWidth = 2;
      context.setLineDash([7, 5]);
      context.beginPath();
      context.roundRect(current.x * width, current.y * height, current.width * width, current.height * height, 10);
      context.fill();
      context.stroke();
      context.setLineDash([]);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draft, selection, uploadPreview]);

  useEffect(() => {
    if (!initialImage) return;
    const image = new Image();
    image.onload = () => { uploadedImageRef.current = image; redraw(); };
    image.src = initialImage;
    return () => { image.onload = null; };
  }, [initialImage]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event.currentTarget, event);
    if (tool === 'select') {
      selectionStartRef.current = point;
      setDraft({ ...point, width: 0, height: 0 });
    } else {
      drawingRef.current = [point];
      redraw();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event.currentTarget, event);
    if (tool === 'select' && selectionStartRef.current) {
      setDraft(getBounds(selectionStartRef.current, point));
    } else if (tool === 'pen' && drawingRef.current.length) {
      drawingRef.current.push(point);
      redraw();
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    if (tool === 'pen') {
      drawingRef.current = [];
      redraw();
      return;
    }
    const start = selectionStartRef.current;
    if (!start) return;
    const bounds = getBounds(start, pointFromEvent(canvas, event));
    selectionStartRef.current = null;
    setDraft(null);
    if (bounds.width < .03 || bounds.height < .03) return;
    const crop = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    crop.width = Math.max(1, Math.round(bounds.width * canvas.clientWidth * ratio));
    crop.height = Math.max(1, Math.round(bounds.height * canvas.clientHeight * ratio));
    const cropContext = crop.getContext('2d');
    if (!cropContext) return;
    cropContext.drawImage(
      canvas,
      Math.round(bounds.x * canvas.width / ratio),
      Math.round(bounds.y * canvas.height / ratio),
      Math.round(bounds.width * canvas.width / ratio),
      Math.round(bounds.height * canvas.height / ratio),
      0, 0, crop.width, crop.height,
    );
    const nextSelection = { ...bounds, imageDataUrl: crop.toDataURL('image/jpeg', .82) };
    setSelection(nextSelection);
    setQuestion('');
    setIsChatOpen(true);
    onSelection?.(nextSelection);
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onload = () => { uploadedImageRef.current = image; setUploadPreview(dataUrl); redraw(); };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
    onUpload?.(file);
    event.target.value = '';
  };

  const submitQuestion = async () => {
    if (!selection || !question.trim() || owl.status === 'thinking') return;
    await owl.askAboutSelection({
      imageDataUrl: selection.imageDataUrl,
      bounds: { x: selection.x, y: selection.y, width: selection.width, height: selection.height },
      prompt: question.trim(),
      lessonId,
    });
  };

  return (
    <section className={`tawjeeh-whiteboard ${className}`} dir="rtl">
      <div className="tawjeeh-whiteboard-main">
        <div className="tawjeeh-whiteboard-header">
          <div>
            <span className="tawjeeh-eyebrow">جلسة تفاعلية</span>
            <h2>{title}</h2>
          </div>
          <div className="tawjeeh-tool-group" role="toolbar" aria-label="أدوات السبورة">
            <button type="button" className={tool === 'select' ? 'is-active' : ''} onClick={() => setTool('select')} aria-label="تحديد جزء للسؤال"><ScanSearch size={16} /></button>
            <button type="button" className={tool === 'pen' ? 'is-active' : ''} onClick={() => setTool('pen')} aria-label="الكتابة على السبورة"><PenLine size={16} /></button>
          </div>
        </div>
        <div className="tawjeeh-canvas-host" data-owl-copilot-host>
          <canvas
            ref={canvasRef}
            className={`tawjeeh-whiteboard-canvas ${tool === 'select' ? 'is-selecting' : 'is-drawing'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label="السبورة التفاعلية"
          />
          <OwlCopilot
            state={owl.status === 'thinking' ? 'Thinking' : owl.status === 'explaining' ? 'Explaining' : selection ? 'Moving' : 'Idle'}
            target={selection}
            message={owl.error ?? owl.answer?.answer ?? 'حدد أي معادلة أو رسم لا تفهمه، وسأقترب منه فورًا.'}
            onAsk={() => setIsChatOpen(true)}
          />
          <span className="tawjeeh-board-hint">{tool === 'select' ? 'اسحب حول الجزء الذي تريد فهمه' : 'اكتب أو ارسم فوق السبورة'}</span>
        </div>
        <div className="tawjeeh-board-actions">
          <label className="tawjeeh-upload">
            <Upload size={15} />
            <span>{uploadPreview ? 'استبدال الحل المصوّر' : 'ارفع صورة حلك المكتوب'}</span>
            <input type="file" accept="image/*" onChange={handleUpload} />
          </label>
          {selection && <button type="button" className="tawjeeh-clear-selection" onClick={() => { setSelection(null); setIsChatOpen(false); owl.reset(); }}><X size={14} /> مسح التحديد</button>}
        </div>
      </div>

      <aside className={`tawjeeh-chat-panel ${isChatOpen ? 'is-open' : ''}`}>
        <div className="tawjeeh-chat-heading">
          <div>
            <span className="tawjeeh-eyebrow">مساحة الفهم</span>
            <h3>اسأل فهيم</h3>
          </div>
          <div className="tawjeeh-chat-avatar"><img src={owlLogoPath} alt="" /></div>
        </div>
        {selection ? (
          <div className="tawjeeh-selection-preview">
            <img src={selection.imageDataUrl} alt="الجزء المحدد من السبورة" />
            <span>تم تثبيت السؤال على هذا الجزء</span>
          </div>
        ) : (
          <div className="tawjeeh-chat-empty"><ImagePlus size={20} /><p>حدد جزءًا من السبورة، ثم اكتب ما الذي لم يتضح لك.</p></div>
        )}
        {owl.answer && <div className="tawjeeh-answer" role="status"><strong>شرح فهيم</strong><p>{owl.answer.answer}</p></div>}
        {owl.error && <p className="tawjeeh-error" role="alert">{owl.error}</p>}
        <div className="tawjeeh-question-box">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="مثال: لماذا يتغير الميل هنا؟"
            aria-label="اكتب سؤالك"
            rows={4}
            disabled={!selection}
          />
          <div className="tawjeeh-question-footer">
            <div>
              <button type="button" aria-label="إرفاق ملف" disabled><Paperclip size={16} /></button>
              <button type="button" aria-label={isListening ? 'إيقاف التسجيل' : 'إملاء السؤال'} onClick={() => setIsListening((value) => !value)} disabled={!selection}><Mic size={16} /></button>
            </div>
            <button type="button" className="tawjeeh-send" onClick={() => void submitQuestion()} disabled={!selection || !question.trim() || owl.status === 'thinking'}>
              {owl.status === 'thinking' ? 'يفكر...' : 'اسأل فهيم'} <Send size={15} />
            </button>
          </div>
        </div>
      </aside>
    </section>
  );
}
