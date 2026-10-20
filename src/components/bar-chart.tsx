"use client";

import { useState } from "react";

export interface BarDatum {
  key: string;
  /** Libellé de l'axe et de l'info-bulle (ex. « 20 oct. »). */
  label: string;
  value: number;
  /** Valeur affichée (ex. « 24,99 $ »). */
  display: string;
}

const W = 640;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 8 };

/**
 * Histogramme d'une seule série (une couleur, pas de légende : le titre la nomme).
 * Barres fines arrondies en haut, quadrillage discret, info-bulle au survol ou au focus.
 */
export function BarChart({ data, title, valueLabel }: { data: BarDatum[]; title: string; valueLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(data.length, 1);
  const gap = Math.min(2, slot * 0.25); // 2 px entre les barres
  const barW = Math.min(Math.max(slot - gap * 2, 1), 28); // barres fines, même sur 7 jours
  const y = (v: number) => (max === 0 ? innerH : innerH - (v / max) * innerH);
  // Quelques étiquettes de dates seulement (début, milieu, fin).
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  const tip = active !== null ? data[active] : null;
  const tipX = active !== null ? ((PAD.left + active * slot + slot / 2) / W) * 100 : 0;
  // Près des bords, l'info-bulle s'aligne vers l'intérieur pour ne pas être coupée.
  const tipShift = tipX > 75 ? "-translate-x-full" : tipX < 25 ? "" : "-translate-x-1/2";

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full overflow-visible" onMouseLeave={() => setActive(null)}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {[0.5, 1].map((f) => (
            <line key={f} x1={0} x2={innerW} y1={innerH - f * innerH} y2={innerH - f * innerH} stroke="var(--line)" strokeDasharray="2 4" />
          ))}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--line)" />
          {data.map((d, i) => {
            const x = i * slot + (slot - barW) / 2;
            const top = y(d.value);
            const h = innerH - top;
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={d.key}>
                {h > 0 && (
                  <path
                    d={`M${x},${innerH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${innerH} Z`}
                    fill="var(--brand)"
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                )}
                {/* Zone de survol plus grande que la barre (toute la hauteur). */}
                <rect
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label} : ${d.display}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
                {(i % labelEvery === 0 || i === data.length - 1) && (
                  <text x={x + barW / 2} y={innerH + 16} textAnchor="middle" fontSize="14" fill="var(--muted)">{d.label}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {tip && active !== null && (
        <div
          role="status"
          className={`pointer-events-none absolute ${tipShift} -translate-y-full whitespace-nowrap rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-sm`}
          style={{ left: `${tipX}%`, top: `calc(${((PAD.top + y(tip.value)) / H) * 100}% - 6px)` }}
        >
          <p className="text-muted">{tip.label}</p>
          <p className="font-semibold tabular-nums text-ink">{valueLabel} : {tip.display}</p>
        </div>
      )}
    </figure>
  );
}
