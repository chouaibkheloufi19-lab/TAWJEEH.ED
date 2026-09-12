import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type WhiteboardPoint = { x: number; y: number };
export type WhiteboardStroke = WhiteboardPoint[];
export type WhiteboardBoardMode = 'pen' | 'highlight' | 'select';
export type WhiteboardHotspot = {
  id: string;
  label: string;
  left: string;
  top: string;
  width: string;
};
export type WhiteboardSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rectangle';
  imageDataUrl: string;
};

export type WhiteboardImage = {
  dataUrl: string;
  fileName: string;
};

export type WhiteboardCanvasCommand = {
  step: number;
  type: 'write' | 'highlight' | 'erase';
  content: string;
  coordinates: { x: number; y: number };
};

type Props = {
  sectionId: string;
  strokes: WhiteboardStroke[];
  mode: WhiteboardBoardMode;
  highlightedPart: string;
  groundedDiagram: boolean;
  animationProgress: number;
  hotspots: WhiteboardHotspot[];
  image?: WhiteboardImage | null;
  canvasCommands?: WhiteboardCanvasCommand[];
  disabled?: boolean;
  className?: string;
  onStrokeCommitted: (stroke: WhiteboardStroke) => void;
  onRegionSelected: (region: WhiteboardHotspot) => void;
  onSelectionComplete: (selection: WhiteboardSelection) => void;
};

function drawBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  sectionId: string,
  strokes: WhiteboardStroke[],
  mode: WhiteboardBoardMode,
  highlightedPart: string,
  groundedDiagram: boolean,
  animationProgress: number,
  hotspots: WhiteboardHotspot[],
  boardImage: HTMLImageElement | null,
  selection: Omit<WhiteboardSelection, 'imageDataUrl'> | null,
  canvasCommands: WhiteboardCanvasCommand[],
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#fbfaf5';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(54, 103, 104, .08)';
  context.lineWidth = 1;
  for (let x = 20; x < width; x += 28) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 20; y < height; y += 28) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  if (boardImage?.complete && boardImage.naturalWidth > 0 && boardImage.naturalHeight > 0) {
    const maxWidth = width * 0.84;
    const maxHeight = height * 0.62;
    const scale = Math.min(maxWidth / boardImage.naturalWidth, maxHeight / boardImage.naturalHeight, 1);
    const imageWidth = boardImage.naturalWidth * scale;
    const imageHeight = boardImage.naturalHeight * scale;
    const imageX = (width - imageWidth) / 2;
    const imageY = Math.max(48, (height - imageHeight) / 2);
    context.save();
    context.globalAlpha = 0.94;
    context.shadowColor = 'rgba(31, 76, 84, .13)';
    context.shadowBlur = 12;
    context.shadowOffsetY = 5;
    context.drawImage(boardImage, imageX, imageY, imageWidth, imageHeight);
    context.restore();
  }

  const reveal = animationProgress > 0 && animationProgress < 100
    ? Math.max(0.08, animationProgress / 100)
    : 1;

  if (groundedDiagram && (sectionId === 'graph' || sectionId === 'recap' || highlightedPart)) {
    const left = width * .16;
    const bottom = height * .78;
    const right = width * .84;
    const top = height * .2;
    context.strokeStyle = '#587b7a';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(left, bottom);
    context.lineTo(right, bottom);
    context.stroke();
    context.beginPath();
    context.moveTo(left, bottom);
    context.lineTo(left, top);
    context.stroke();
    context.fillStyle = '#587b7a';
    context.font = '600 12px IBM Plex Sans Arabic, sans-serif';
    const typedText = 'الزمن'.slice(0, Math.max(1, Math.ceil('الزمن'.length * reveal)));
    context.fillText(typedText, right - 32, bottom + 25);
    context.fillText('الموضع'.slice(0, Math.max(1, Math.ceil(6 * reveal))), left + 8, top - 9);
    context.save();
    context.beginPath();
    context.rect(0, 0, width * reveal, height);
    context.clip();
    context.strokeStyle = '#005f73';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(left + 8, bottom - 10);
    context.bezierCurveTo(width * .34, height * .67, width * .48, height * .56, width * .63, height * .43);
    context.bezierCurveTo(width * .71, height * .36, width * .77, height * .29, right - 3, top + 8);
    context.stroke();
    context.fillStyle = '#005f73';
    context.beginPath();
    context.arc(width * .63, height * .43, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  const selectedRegion = hotspots.find((region) => region.label === highlightedPart);
  if (selectedRegion) {
    const left = Number.parseFloat(selectedRegion.left) / 100 * width;
    const top = Number.parseFloat(selectedRegion.top) / 100 * height;
    const regionWidth = Number.parseFloat(selectedRegion.width) / 100 * width;
    context.fillStyle = 'rgba(219, 183, 96, .18)';
    context.strokeStyle = '#b98a2c';
    context.lineWidth = 2;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.roundRect(left, top, regionWidth, height * .19, 9);
    context.fill();
    context.stroke();
    context.setLineDash([]);
  }

  canvasCommands.forEach((command) => {
    const x = Math.min(1, Math.max(0, command.coordinates.x)) * width;
    const y = Math.min(1, Math.max(0, command.coordinates.y)) * height;
    if (command.type === 'write') {
      context.fillStyle = '#173f4c';
      context.font = '700 14px IBM Plex Sans Arabic, sans-serif';
      command.content.split('\n').slice(0, 3).forEach((line, index) => {
        context.fillText(line.slice(0, 34), x, y + index * 19);
      });
      return;
    }
    const boxWidth = Math.min(width * 0.3, Math.max(72, command.content.length * 7));
    const boxHeight = command.type === 'erase' ? 34 : 38;
    context.save();
    context.beginPath();
    context.roundRect(x, y - boxHeight + 7, boxWidth, boxHeight, 8);
    context.fillStyle = command.type === 'highlight'
      ? 'rgba(219, 183, 96, .3)'
      : 'rgba(251, 250, 245, .92)';
    context.strokeStyle = command.type === 'highlight'
      ? 'rgba(185, 138, 44, .85)'
      : 'rgba(54, 103, 104, .22)';
    context.lineWidth = 2;
    context.setLineDash(command.type === 'highlight' ? [5, 4] : []);
    context.fill();
    context.stroke();
    context.restore();
  });

  strokes.forEach((stroke) => {
    if (stroke.length < 2) return;
    context.beginPath();
    context.moveTo(stroke[0].x * width, stroke[0].y * height);
    stroke.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
    context.strokeStyle = mode === 'highlight' ? 'rgba(220, 169, 64, .72)' : '#315c66';
    context.lineWidth = mode === 'highlight' ? 11 : 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();
  });

  if (selection) {
    const left = selection.x * width;
    const top = selection.y * height;
    const selectionWidth = selection.width * width;
    const selectionHeight = selection.height * height;
    context.fillStyle = 'rgba(38, 155, 154, .11)';
    context.strokeStyle = '#159a99';
    context.lineWidth = 2;
    context.setLineDash([7, 5]);
    context.beginPath();
    context.roundRect(left, top, selectionWidth, selectionHeight, 9);
    context.fill();
    context.stroke();
    context.setLineDash([]);
  }
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>): WhiteboardPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

export function InteractiveWhiteboard({
  sectionId,
  strokes,
  mode,
  highlightedPart,
  groundedDiagram,
  animationProgress,
  hotspots,
  image = null,
  canvasCommands = [],
  disabled = false,
  className = '',
  onStrokeCommitted,
  onRegionSelected,
  onSelectionComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef<WhiteboardStroke>([]);
  const selectionStartRef = useRef<WhiteboardPoint | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<Omit<WhiteboardSelection, 'imageDataUrl'> | null>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    drawBoard(
      context,
      canvas.clientWidth,
      canvas.clientHeight,
      sectionId,
      [...strokes, ...(drawingRef.current.length ? [drawingRef.current] : [])],
      mode,
      highlightedPart,
      groundedDiagram,
      animationProgress,
      hotspots,
      imageRef.current,
      selectionDraft,
      canvasCommands,
    );
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      const context = canvas.getContext('2d');
      if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [sectionId, strokes, mode, highlightedPart, groundedDiagram, animationProgress, hotspots, selectionDraft, image, canvasCommands]);

  useEffect(() => {
    if (!image?.dataUrl) {
      imageRef.current = null;
      redraw();
      return;
    }
    const nextImage = new Image();
    nextImage.onload = () => {
      imageRef.current = nextImage;
      redraw();
    };
    nextImage.src = image.dataUrl;
    return () => {
      nextImage.onload = null;
    };
  }, [image?.dataUrl]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(canvas, event);
    if (mode === 'select') {
      selectionStartRef.current = point;
      setSelectionDraft({ x: point.x, y: point.y, width: 0, height: 0, shape: 'rectangle' });
      return;
    }
    if (mode === 'pen') {
      drawingRef.current = [point];
      redraw();
      return;
    }
    const region = hotspots.find((item) => {
      const left = Number.parseFloat(item.left) / 100;
      const top = Number.parseFloat(item.top) / 100;
      const right = left + Number.parseFloat(item.width) / 100;
      return point.x >= left && point.x <= right && point.y >= top && point.y <= top + .19;
    });
    if (region) onRegionSelected(region);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = event.currentTarget;
    const point = getCanvasPoint(canvas, event);
    if (mode === 'select' && selectionStartRef.current) {
      const start = selectionStartRef.current;
      setSelectionDraft({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
        shape: 'rectangle',
      });
      return;
    }
    if (mode === 'pen' && drawingRef.current.length) {
      drawingRef.current = [...drawingRef.current, point];
      redraw();
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = event.currentTarget;
    if (mode === 'select' && selectionStartRef.current) {
      const point = getCanvasPoint(canvas, event);
      const start = selectionStartRef.current;
      const selection = {
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
        shape: 'rectangle' as const,
      };
      selectionStartRef.current = null;
      setSelectionDraft(selection);
      if (selection.width < 0.04 || selection.height < 0.04) return;
      const crop = document.createElement('canvas');
      const pixelRatio = window.devicePixelRatio || 1;
      crop.width = Math.max(1, Math.round(selection.width * canvas.clientWidth * pixelRatio));
      crop.height = Math.max(1, Math.round(selection.height * canvas.clientHeight * pixelRatio));
      const cropContext = crop.getContext('2d');
      if (!cropContext) return;
      cropContext.drawImage(
        canvas,
        Math.round(selection.x * canvas.width / pixelRatio),
        Math.round(selection.y * canvas.height / pixelRatio),
        Math.round(selection.width * canvas.width / pixelRatio),
        Math.round(selection.height * canvas.height / pixelRatio),
        0,
        0,
        crop.width,
        crop.height,
      );
      onSelectionComplete({ ...selection, imageDataUrl: crop.toDataURL('image/jpeg', 0.78) });
      return;
    }
    if (mode === 'pen' && drawingRef.current.length) {
      const completedStroke = drawingRef.current;
      drawingRef.current = [];
      onStrokeCommitted(completedStroke);
      redraw();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className={`lesson-whiteboard-canvas ${mode === 'highlight' ? 'is-highlighting' : ''} ${mode === 'select' ? 'is-selecting' : ''} ${disabled ? 'is-locked' : ''} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label={mode === 'select' ? 'حدد جزءًا من السبورة لطرح سؤال' : 'لوح تفاعلي للكتابة والرسم والتحديد'}
      data-testid="canvas-lesson-whiteboard"
    />
  );
}