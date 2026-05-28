import { useEffect, useRef } from 'react';
import { useSimVis } from '../../../components/SimVisContext';
import { setInput } from '../../../engine/engine';
import { usePidSimState } from '../usePidSimState';
import { PidDiagram, Overlay, Slider, type SliderSpec } from '../PidPrimitives';
import './pid-tune-relay.css';

const W = 1000;
const H = 320;

const SETPOINT = { x: 40,  y: 70,  w: 112, h: 60  };
const SETPOINT_HEADER_H = 30;
const SUM      = { cx: 210, cy: 100, r: 22 };
const PID      = { x: 320, y: 40,  w: 168, h: 120 };
const PID_HEADER_H = 30;
const PID_BAND_H = (PID.h - PID_HEADER_H) / 3;
const P_BAND   = { x: PID.x, y: PID.y + PID_HEADER_H,                  w: PID.w, h: PID_BAND_H };
const I_BAND   = { x: PID.x, y: PID.y + PID_HEADER_H +     PID_BAND_H, w: PID.w, h: PID_BAND_H };
const D_BAND   = { x: PID.x, y: PID.y + PID_HEADER_H + 2 * PID_BAND_H, w: PID.w, h: PID_BAND_H };
const TUNER    = { x: PID.x, y: 180, w: PID.w, h: 80  };
const TUNER_HEADER_H = 24;
const PLANT    = { x: 700, y: 55,  w: 154, h: 90  };
const PLANT_HEADER_H = 30;
const PLANT_BAND_H = (PLANT.h - PLANT_HEADER_H) / 2;
const MASS_BAND = { x: PLANT.x, y: PLANT.y + PLANT_HEADER_H,                  w: PLANT.w, h: PLANT_BAND_H };
const DAMP_BAND = { x: PLANT.x, y: PLANT.y + PLANT_HEADER_H + PLANT_BAND_H,   w: PLANT.w, h: PLANT_BAND_H };
const SWITCH   = { cx: 594, cy: 100, r: 6 };
const OUT_END  = { x: 970, y: 100 };
const FB_X     = 940;
const FB_Y     = 290;

const ERR_TAP_X = 276;
const FB_TAP_X  = 400;
const TUNER_OUT_Y = TUNER.y + 24;

const SETPOINT_SLIDER: SliderSpec = { field: 'target', label: 'Target', min: -5, max: 5, step: 0.05 };
const KP_SLIDER:       SliderSpec = { field: 'kp',     label: 'P:',     min: 0,  max: 10, step: 0.1 };
const KI_SLIDER:       SliderSpec = { field: 'ki',     label: 'I:',     min: 0,  max: 5,  step: 0.05 };
const KD_SLIDER:       SliderSpec = { field: 'kd',     label: 'D:',     min: 0,  max: 5,  step: 0.05 };
const MASS_SLIDER:     SliderSpec = { field: 'mass',   label: 'M:',     min: 0.1, max: 5, step: 0.1 };
const DAMP_SLIDER:     SliderSpec = { field: 'damping',label: 'D:',     min: 0,  max: 2,  step: 0.05 };

export default function PidTuneRelayVis() {
  const { simId, rewindTick } = useSimVis();
  const { isRewinding, readBlock, readNum, handleChange } = usePidSimState(simId, rewindTick);

  const controlVal = readNum(['tuner', 'control_out']);
  const errorVal   = readNum(['setpoint', 'signal_error']);
  const outputVal  = readNum(['plant', 'out']);
  const tuning     = readNum(['tuner', 'tuning']);
  const cycleCount = readNum(['tuner', 'cycle_count']);
  const ku         = readNum(['tuner', 'ku']);
  const tu         = readNum(['tuner', 'tu']);
  const isTuning   = tuning > 0.5;

  // When tuning finishes (1→0), copy identified gains into controller sliders
  const prevTuningRef = useRef(0);
  useEffect(() => {
    if (isRewinding) return;
    const prev = prevTuningRef.current;
    if (prev > 0.5 && tuning < 0.5) {
      setInput(simId, 'controller.kp', readNum(['tuner', 'kp_new']));
      setInput(simId, 'controller.ki', readNum(['tuner', 'ki_new']));
      setInput(simId, 'controller.kd', readNum(['tuner', 'kd_new']));
    }
    prevTuningRef.current = tuning;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuning, isRewinding, simId]);

  const handleTune = () => {
    if (isRewinding) return;
    setInput(simId, 'tuner.tune_signal', Date.now());
  };

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

        {/* Main blocks */}
        <rect x={SETPOINT.x} y={SETPOINT.y} width={SETPOINT.w} height={SETPOINT.h}
              className="pid-block__box" rx="6" />
        <rect x={PID.x}      y={PID.y}      width={PID.w}      height={PID.h}
              className="pid-block__box" rx="6" />
        <rect x={TUNER.x}    y={TUNER.y}    width={TUNER.w}    height={TUNER.h}
              className={`pid-block__box${isTuning ? ' pid-tuner-box--active' : ''}`} rx="6" />
        <rect x={PLANT.x}    y={PLANT.y}    width={PLANT.w}    height={PLANT.h}
              className="pid-block__box" rx="6" />

        {/* Header dividers */}
        <line x1={SETPOINT.x} y1={SETPOINT.y + SETPOINT_HEADER_H}
              x2={SETPOINT.x + SETPOINT.w} y2={SETPOINT.y + SETPOINT_HEADER_H}
              className="pid-block__divider" />
        <line x1={PID.x}    y1={P_BAND.y} x2={PID.x + PID.w}    y2={P_BAND.y}
              className="pid-block__divider" />
        <line x1={TUNER.x}  y1={TUNER.y + TUNER_HEADER_H}
              x2={TUNER.x + TUNER.w} y2={TUNER.y + TUNER_HEADER_H}
              className="pid-block__divider" />
        <line x1={PLANT.x}  y1={PLANT.y + PLANT_HEADER_H}
              x2={PLANT.x + PLANT.w} y2={PLANT.y + PLANT_HEADER_H}
              className="pid-block__divider" />

        {/* PID band dividers */}
        <line x1={PID.x} y1={I_BAND.y} x2={PID.x + PID.w} y2={I_BAND.y} className="pid-block__divider" />
        <line x1={PID.x} y1={D_BAND.y} x2={PID.x + PID.w} y2={D_BAND.y} className="pid-block__divider" />

        {/* Plant divider */}
        <line x1={PLANT.x} y1={DAMP_BAND.y} x2={PLANT.x + PLANT.w} y2={DAMP_BAND.y} className="pid-block__divider" />

        {/* Summing junction */}
        <circle cx={SUM.cx} cy={SUM.cy} r={SUM.r} className="pid-block__box" />
        <text x={SUM.cx - SUM.r - 8} y={SUM.cy - 10}         className="pid-sign pid-sign--plus"  textAnchor="end">+</text>
        <text x={SUM.cx + 10}        y={SUM.cy + SUM.r + 14} className="pid-sign pid-sign--minus" textAnchor="start">−</text>

        {/* Main signal wires */}
        <line x1={SETPOINT.x + SETPOINT.w} y1={SUM.cy}
              x2={SUM.cx - SUM.r}          y2={SUM.cy}
              className="pid-wire" markerEnd="url(#arrowhead)" />
        <line x1={SUM.cx + SUM.r} y1={SUM.cy}
              x2={PID.x}          y2={SUM.cy}
              className="pid-wire" markerEnd="url(#arrowhead)" />
        <line x1={PID.x + PID.w} y1={SUM.cy}
              x2={SWITCH.cx - SWITCH.r} y2={SUM.cy}
              className={`pid-wire${isTuning ? ' pid-wire--dim' : ''}`}
              markerEnd="url(#arrowhead)" />
        <line x1={SWITCH.cx + SWITCH.r} y1={SUM.cy}
              x2={PLANT.x}              y2={SUM.cy}
              className={`pid-wire${isTuning ? ' pid-wire--relay' : ''}`}
              markerEnd={isTuning ? 'url(#arrowhead-tune)' : 'url(#arrowhead)'} />
        <line x1={PLANT.x + PLANT.w} y1={SUM.cy}
              x2={OUT_END.x}         y2={OUT_END.y}
              className="pid-wire" markerEnd="url(#arrowhead)" />

        {/* Feedback path */}
        <polyline
          points={`${FB_X},${SUM.cy} ${FB_X},${FB_Y} ${SUM.cx},${FB_Y} ${SUM.cx},${SUM.cy + SUM.r}`}
          className="pid-wire pid-wire--feedback" markerEnd="url(#arrowhead)" />
        <circle cx={FB_X} cy={SUM.cy} r="3.5" className="pid-junction-dot" />

        {/* Tuner taps */}
        <polyline
          points={`${ERR_TAP_X},${SUM.cy} ${ERR_TAP_X},${TUNER.y + TUNER.h / 2} ${TUNER.x},${TUNER.y + TUNER.h / 2}`}
          className="pid-wire pid-wire--tap"
          markerEnd="url(#arrowhead)" />
        <circle cx={ERR_TAP_X} cy={SUM.cy} r="3.5" className="pid-junction-dot" />
        <line x1={FB_TAP_X} y1={FB_Y}
              x2={FB_TAP_X} y2={TUNER.y + TUNER.h}
              className="pid-wire pid-wire--tap"
              markerEnd="url(#arrowhead)" />
        <circle cx={FB_TAP_X} cy={FB_Y} r="3.5" className="pid-junction-dot" />
        <polyline
          points={`${TUNER.x + TUNER.w},${TUNER_OUT_Y} ${SWITCH.cx},${TUNER_OUT_Y} ${SWITCH.cx},${SWITCH.cy + SWITCH.r}`}
          className={`pid-wire${isTuning ? ' pid-wire--relay' : ' pid-wire--dim'}`}
          markerEnd={isTuning ? 'url(#arrowhead-tune)' : 'url(#arrowhead)'} />

        {/* Switch symbol */}
        <circle cx={SWITCH.cx} cy={SWITCH.cy} r={SWITCH.r}
                className={`pid-switch-symbol${isTuning ? ' pid-switch-symbol--tuning' : ''}`} />

        {/* Signal labels */}
        <text x={(SUM.cx + SUM.r + PID.x) / 2} y={SUM.cy - 10}
              className="pid-signal" textAnchor="middle">
          error: {errorVal.toFixed(3)}
        </text>
        <text x={(PID.x + PID.w + SWITCH.cx - SWITCH.r) / 2} y={SUM.cy - 10}
              className={`pid-signal${isTuning ? ' pid-signal--muted' : ''}`} textAnchor="middle">
          pid out
        </text>
        <text x={(SWITCH.cx + SWITCH.r + PLANT.x) / 2} y={SUM.cy - 10}
              className="pid-signal" textAnchor="middle">
          control: {controlVal.toFixed(2)}
        </text>
        <text x={SWITCH.cx + 8} y={(TUNER_OUT_Y + SWITCH.cy) / 2}
              className={`pid-signal${isTuning ? '' : ' pid-signal--muted'}`} textAnchor="start">
          relay
        </text>
        <text x={ERR_TAP_X + 6} y={TUNER.y - 6}
              className="pid-signal pid-signal--muted" textAnchor="start">error</text>
        <text x={FB_TAP_X + 6} y={TUNER.y + TUNER.h + 14}
              className="pid-signal pid-signal--muted" textAnchor="start">y (plant.out)</text>
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
              className="pid-title" textAnchor="middle">PID</text>
        <text x={TUNER.x + 30} y={TUNER.y + 17}
              className="pid-title" textAnchor="start">Tuner</text>
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

      <Overlay x={PID.x + 10} y={P_BAND.y} w={PID.w - 20} h={30}>
        <Slider spec={KP_SLIDER}
                value={readBlock('controller')[KP_SLIDER.field]}
                disabled={isRewinding || isTuning}
                onChange={v => handleChange('controller', KP_SLIDER.field, v)} />
      </Overlay>
      <Overlay x={PID.x + 10} y={I_BAND.y} w={PID.w - 20} h={30}>
        <Slider spec={KI_SLIDER}
                value={readBlock('controller')[KI_SLIDER.field]}
                disabled={isRewinding || isTuning}
                onChange={v => handleChange('controller', KI_SLIDER.field, v)} />
      </Overlay>
      <Overlay x={PID.x + 10} y={D_BAND.y} w={PID.w - 20} h={30}>
        <Slider spec={KD_SLIDER}
                value={readBlock('controller')[KD_SLIDER.field]}
                disabled={isRewinding || isTuning}
                onChange={v => handleChange('controller', KD_SLIDER.field, v)} />
      </Overlay>

      <Overlay x={PLANT.x + 8} y={MASS_BAND.y} w={PLANT.w - 16} h={30}>
        <Slider spec={MASS_SLIDER}
                value={readBlock('plant')[MASS_SLIDER.field]}
                disabled={isRewinding}
                onChange={v => handleChange('plant', MASS_SLIDER.field, v)} />
      </Overlay>
      <Overlay x={PLANT.x + 8} y={DAMP_BAND.y} w={PLANT.w - 16} h={30}>
        <Slider spec={DAMP_SLIDER}
                value={readBlock('plant')[DAMP_SLIDER.field]}
                disabled={isRewinding}
                onChange={v => handleChange('plant', DAMP_SLIDER.field, v)} />
      </Overlay>

      <Overlay x={TUNER.x + TUNER.w - 76} y={TUNER.y + 2} w={68} h={20}>
        <button
          className={`pid-switch${isTuning ? ' pid-switch--on' : ' pid-switch--retune'}`}
          onClick={handleTune}
          disabled={isRewinding}
        >
          {isTuning ? 'TUNING' : 'TUNE NOW'}
        </button>
      </Overlay>

      <Overlay x={TUNER.x + 8} y={TUNER.y + TUNER_HEADER_H + 2}
               w={TUNER.w - 16} h={TUNER.h - TUNER_HEADER_H - 4}>
        <div className="pid-tuner-relay-body">
          <div className="pid-tuner-readout">
            <span className="pid-tuner-readout__label">status</span>
            <span className="pid-tuner-readout__value">
              {isTuning ? `cycle ${Math.max(0, Math.round(cycleCount) - 1)}/4` : 'idle'}
            </span>
          </div>
          <div className="pid-tuner-readout">
            <span className="pid-tuner-readout__label">Ku</span>
            <span className="pid-tuner-readout__value">{ku.toFixed(2)}</span>
          </div>
          <div className="pid-tuner-readout">
            <span className="pid-tuner-readout__label">Tu</span>
            <span className="pid-tuner-readout__value">{tu.toFixed(2)}s</span>
          </div>
        </div>
      </Overlay>
    </PidDiagram>
  );
}
