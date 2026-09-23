"use client";

import { Button } from "@/components/ui/button";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type Point = { x: number; y: number };
type Stroke = Point[];

export type SignaturePadHandle = {
  toPng: () => string;
  isEmpty: () => boolean;
  clear: () => void;
};

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { onChange?: (empty: boolean) => void }
>(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const drawing = useRef(false);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1f2c";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
  }

  useImperativeHandle(ref, () => ({
    toPng: () => canvasRef.current?.toDataURL("image/png") ?? "",
    isEmpty: () => !strokes.current.some((stroke) => stroke.length > 1),
    clear: () => {
      strokes.current = [];
      redraw();
      onChange?.(true);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function notify() {
    onChange?.(!strokes.current.some((stroke) => stroke.length > 1));
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-56 w-full touch-none rounded-md border border-border bg-white sm:h-44"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          current.current = [pointFromEvent(event)];
          strokes.current = [...strokes.current, current.current];
        }}
        onPointerMove={(event) => {
          if (!drawing.current || !current.current) return;
          current.current.push(pointFromEvent(event));
          redraw();
        }}
        onPointerUp={() => {
          drawing.current = false;
          current.current = null;
          notify();
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => {
            strokes.current = strokes.current.slice(0, -1);
            redraw();
            notify();
          }}
        >
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => {
            strokes.current = [];
            redraw();
            notify();
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
});
