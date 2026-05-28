import { useSimVis } from '../../../components/SimVisContext';
import { usePidSimState } from '../usePidSimState';
import { PidDiagram, Overlay, Slider, type SliderSpec } from '../PidPrimitives';

const W = 1000;
const H = 300;

const SETPOINT = { x: 40,  y: 70,  w: 112, h: 60  };
const SETPOINT_HEADER_H = 30;
const SUM      = { cx: 210, cy: 100, r: 22 };
const PID      = { x: 340, y: 40,  w: 168, h: 120 };
const PID_HEADER_H = 30;
const PID_BAND_H = (PID.h - PID_HEADER_H) / 3;
const P_BAND   = { x: PID.x, y: PID.y + PID_HEADER_H,                  w: PID.w, h: PID_BAND_H };
const I_BAND   = { x: PID.x, y: PID.y + PID_HEADER_H +     PID_BAND_H, w: PID.w, h: PID_BAND_H };
const D_BAND   = { x: PID.x, y: PID.y + PID_HEADER_H + 2 * PID_BAND_H, w: PID.w, h: PID_BAND_H };
const PLANT    = { x: 680, y: 55,  w: 154, h: 90  };
const PLANT_HEADER_H = 30;
const PLANT_BAND_H = (PLANT.h - PLANT_HEADER_H) / 2;
const MASS_BAND = { x: PLANT.x, y: PLANT.y + PLANT_HEADER_H,                  w: PLANT.w, h: PLANT_BAND_H };
const DAMP_BAND = { x: PLANT.x, y: PLANT.y + PLANT_HEADER_H + PLANT_BAND_H,   w: PLANT.w, h: PLANT_BAND_H };
const OUT_END  = { x: 970, y: 100 };
const FB_X     = 940;
const FB_Y     = 250;

const SETPOINT_SLIDER: SliderSpec = { field: 'target', label: 'Target', min: -2, max: 2, step: 0.05 };
const KP_SLIDER:       SliderSpec = { field: 'kp',     label: 'P:',      min: 0,  max: 10, step: 0.1 };
const KI_SLIDER:       SliderSpec = { field: 'ki',     label: 'I:',      min: 0,  max: 5,  step: 0.05 };
const KD_SLIDER:       SliderSpec = { field: 'kd',     label: 'D:',      min: 0,  max: 5,  step: 0.05 };
const MASS_SLIDER:     SliderSpec = { field: 'mass',   label: 'M:',     min: 0.1, max: 5, step: 0.1 };
const DAMP_SLIDER:     SliderSpec = { field: 'damping',label: 'D:',     min: 0,  max: 2,  step: 0.05 };

export default function PidTutorialVis() {
  const { simId, rewindTick } = useSimVis();
  const { isRewinding, readBlock, readNum, handleChange } = usePidSimState(simId, rewindTick);

  const errorVal   = readNum(['setpoint', 'signal_error']);
  const controlVal = readNum(['controller', 'control']);
  const outputVal  = readNum(['plant', 'out']);

  return (
    <PidDiagram W={W} H={H}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="pid-diagram__svg"
      >
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#aaa" />
          </marker>
        </defs>

        {/* Blocks */}
        <rect x={SETPOINT.x} y={SETPOINT.y} width={SETPOINT.w} height={SETPOINT.h}
              className="pid-block__box" rx="6" />
        <rect x={PID.x}      y={PID.y}      width={PID.w}      height={PID.h}
              className="pid-block__box" rx="6" />
        <rect x={PLANT.x}    y={PLANT.y}    width={PLANT.w}    height={PLANT.h}
              className="pid-block__box" rx="6" />

        {/* Header dividers */}
        <line x1={SETPOINT.x} y1={SETPOINT.y + SETPOINT_HEADER_H}
              x2={SETPOINT.x + SETPOINT.w} y2={SETPOINT.y + SETPOINT_HEADER_H}
              className="pid-block__divider" />
        <line x1={PID.x} y1={P_BAND.y} x2={PID.x + PID.w} y2={P_BAND.y}
              className="pid-block__divider" />
        <line x1={PLANT.x} y1={PLANT.y + PLANT_HEADER_H}
              x2={PLANT.x + PLANT.w} y2={PLANT.y + PLANT_HEADER_H}
              className="pid-block__divider" />

        {/* PID band dividers */}
        <line x1={PID.x} y1={I_BAND.y} x2={PID.x + PID.w} y2={I_BAND.y} className="pid-block__divider" />
        <line x1={PID.x} y1={D_BAND.y} x2={PID.x + PID.w} y2={D_BAND.y} className="pid-block__divider" />

        {/* Plant divider */}
        <line x1={PLANT.x} y1={DAMP_BAND.y} x2={PLANT.x + PLANT.w} y2={DAMP_BAND.y} className="pid-block__divider" />

        {/* Summing junction */}
        <circle cx={SUM.cx} cy={SUM.cy} r={SUM.r} className="pid-block__box" />
        <text x={SUM.cx - SUM.r - 8}  y={SUM.cy - 10}         className="pid-sign pid-sign--plus"  textAnchor="end">+</text>
        <text x={SUM.cx + 10}         y={SUM.cy + SUM.r + 14} className="pid-sign pid-sign--minus" textAnchor="start">−</text>

        {/* Wires */}
        <line x1={SETPOINT.x + SETPOINT.w} y1={SUM.cy}
              x2={SUM.cx - SUM.r}          y2={SUM.cy}
              className="pid-wire" markerEnd="url(#arrowhead)" />
        <line x1={SUM.cx + SUM.r} y1={SUM.cy}
              x2={PID.x}          y2={SUM.cy}
              className="pid-wire" markerEnd="url(#arrowhead)" />
        <line x1={PID.x + PID.w} y1={SUM.cy}
              x2={PLANT.x}       y2={SUM.cy}
              className="pid-wire" markerEnd="url(#arrowhead)" />
        <line x1={PLANT.x + PLANT.w} y1={SUM.cy}
              x2={OUT_END.x}         y2={OUT_END.y}
              className="pid-wire" markerEnd="url(#arrowhead)" />

        {/* Feedback path */}
        <polyline
          points={`${FB_X},${SUM.cy} ${FB_X},${FB_Y} ${SUM.cx},${FB_Y} ${SUM.cx},${SUM.cy + SUM.r}`}
          className="pid-wire pid-wire--feedback" markerEnd="url(#arrowhead)" />
        <circle cx={FB_X} cy={SUM.cy} r="3.5" className="pid-junction-dot" />

        {/* Signal labels */}
        <text x={(SUM.cx + SUM.r + PID.x) / 2} y={SUM.cy - 10}
              className="pid-signal" textAnchor="middle">
          error: {errorVal.toFixed(3)}
        </text>
        <text x={(PID.x + PID.w + PLANT.x) / 2} y={SUM.cy - 10}
              className="pid-signal" textAnchor="middle">
          control: {controlVal.toFixed(3)}
        </text>
        <text x={(PLANT.x + PLANT.w + OUT_END.x) / 2} y={SUM.cy - 10}
              className="pid-signal" textAnchor="middle">
          output: {outputVal.toFixed(3)}
        </text>
        <text x={(SUM.cx + FB_X) / 2} y={FB_Y + 18}
              className="pid-signal pid-signal--muted" textAnchor="middle">
          plant.out (feedback)
        </text>

        {/* Block titles */}
        <text x={SETPOINT.x + SETPOINT.w / 2} y={SETPOINT.y + 22}
              className="pid-title" textAnchor="middle">Setpoint</text>
        <text x={PID.x + PID.w / 2} y={PID.y + 22}
              className="pid-title" textAnchor="middle">PID Controller</text>
        <text x={PLANT.x + PLANT.w / 2} y={PLANT.y + 22}
              className="pid-title" textAnchor="middle">Plant</text>
      </svg>

      <Overlay x={50} y={100} w={92} h={30}>
        <Slider spec={SETPOINT_SLIDER}
                value={readBlock('setpoint')[SETPOINT_SLIDER.field]}
                disabled={isRewinding}
                hideLabel
                onChange={v => handleChange('setpoint', SETPOINT_SLIDER.field, v)} />
      </Overlay>

      <Overlay x={350} y={70} w={148} h={30}>
        <Slider spec={KP_SLIDER}
                value={readBlock('controller')[KP_SLIDER.field]}
                disabled={isRewinding}
                onChange={v => handleChange('controller', KP_SLIDER.field, v)} />
      </Overlay>
      <Overlay x={350} y={100} w={148} h={30}>
        <Slider spec={KI_SLIDER}
                value={readBlock('controller')[KI_SLIDER.field]}
                disabled={isRewinding}
                onChange={v => handleChange('controller', KI_SLIDER.field, v)} />
      </Overlay>
      <Overlay x={350} y={130} w={148} h={30}>
        <Slider spec={KD_SLIDER}
                value={readBlock('controller')[KD_SLIDER.field]}
                disabled={isRewinding}
                onChange={v => handleChange('controller', KD_SLIDER.field, v)} />
      </Overlay>

      <Overlay x={686} y={MASS_BAND.y} w={142} h={30}>
        <Slider spec={MASS_SLIDER}
                value={readBlock('plant')[MASS_SLIDER.field]}
                disabled={isRewinding}
                onChange={v => handleChange('plant', MASS_SLIDER.field, v)} />
      </Overlay>
      <Overlay x={686} y={DAMP_BAND.y} w={142} h={30}>
        <Slider spec={DAMP_SLIDER}
                value={readBlock('plant')[DAMP_SLIDER.field]}
                disabled={isRewinding}
                onChange={v => handleChange('plant', DAMP_SLIDER.field, v)} />
      </Overlay>
    </PidDiagram>
  );
}
