import { createContext, useContext, type ReactNode } from 'react';
import './pid-diagram.css';

const DiagramCtx = createContext({ W: 1000, H: 300 });

export type SliderSpec = { field: string; label: string; min: number; max: number; step: number };

export function PidDiagram({ W, H, children }: { W: number; H: number; children: ReactNode }) {
  return (
    <DiagramCtx.Provider value={{ W, H }}>
      <div className="pid-diagram" style={{ aspectRatio: `${W} / ${H}` }}>
        {children}
      </div>
    </DiagramCtx.Provider>
  );
}

export function Overlay({ x, y, w, h, children }: {
  x: number; y: number; w: number; h: number; children: ReactNode;
}) {
  const { W, H } = useContext(DiagramCtx);
  return (
    <div className="pid-overlay" style={{
      left:   `${(x / W) * 100}%`,
      top:    `${(y / H) * 100}%`,
      width:  `${(w / W) * 100}%`,
      height: `${(h / H) * 100}%`,
    }}>
      {children}
    </div>
  );
}

export function Slider({ spec, value, disabled, onChange, hideLabel }: {
  spec: SliderSpec;
  value: unknown;
  disabled: boolean;
  onChange: (v: number) => void;
  hideLabel?: boolean;
}) {
  const num = typeof value === 'number' ? value : spec.min;
  return (
    <div className={`pid-slider${hideLabel ? ' pid-slider--no-label' : ''}`}>
      {!hideLabel && <label className="pid-slider__label">{spec.label}</label>}
      <input
        type="range"
        min={spec.min} max={spec.max} step={spec.step}
        value={num}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="pid-slider__input"
      />
      <span className="pid-slider__value">{num.toFixed(2)}</span>
    </div>
  );
}
