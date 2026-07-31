// SVG a mano, sin recharts: esto se dibuja una vez por fila de la tabla de
// Inventario (potencialmente decenas), y una gráfica completa de recharts
// por fila sería carísimo y sin espacio para su propio chrome (ejes,
// tooltips). Un polyline mínimo es lo que necesita un sparkline.
export function Sparkline({
  data,
  width = 72,
  height = 24,
  color = "#2E6B4E",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2 || data.every((v) => v === 0)) {
    return (
      <svg width={width} height={height} className="text-faint" aria-hidden="true">
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="2,3"
        />
      </svg>
    );
  }

  const max = Math.max(...data);
  const pad = 2;
  const puntos = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - (v / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline
        points={puntos.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
