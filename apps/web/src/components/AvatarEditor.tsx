"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PaintBucket, Pencil, RotateCcw } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

type Tool = "brush" | "eraser" | "fill";

export function AvatarEditor({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#b56cff");
  const [size, setSize] = useState(18);
  const [opacity, setOpacity] = useState(0.9);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(10, 14, 24, 0.88)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(181, 108, 255, 0.2)";
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = value;
    }
  }, []);

  function commit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || tool === "fill") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = point(event);

    ctx.globalAlpha = tool === "eraser" ? 1 : opacity;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = point(event);

    if (tool === "fill") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      commit();
      return;
    }

    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(x, y);
    draw(event);
  }

  function stop() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.closePath();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    commit();
  }

  function reset() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(10, 14, 24, 0.88)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    commit();
  }

  return (
    <div className="avatar-editor">
      <canvas ref={canvasRef} width={256} height={256} onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerLeave={stop} />

      <div className="editor-tools">
        <button type="button" className={tool === "brush" ? "selected" : ""} onClick={() => setTool("brush")} title="Кисть">
          <Pencil size={17} />
        </button>
        <button type="button" className={tool === "eraser" ? "selected" : ""} onClick={() => setTool("eraser")} title="Ластик">
          <Eraser size={17} />
        </button>
        <button type="button" className={tool === "fill" ? "selected" : ""} onClick={() => setTool("fill")} title="Заливка">
          <PaintBucket size={17} />
        </button>
        <button type="button" onClick={reset} title="Очистить">
          <RotateCcw size={17} />
        </button>
      </div>

      <div className="editor-grid">
        <label>
          Цвет
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <label>
          Размер
          <input type="range" min={2} max={54} value={size} onChange={(event) => setSize(Number(event.target.value))} />
        </label>
        <label>
          Прозрачность
          <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
        </label>
      </div>

      <p>Аватар рисуется только при регистрации и после создания аккаунта больше не меняется.</p>
    </div>
  );
}
