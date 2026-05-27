import { useSimVis } from '../../../components/SimVis';
import { setInput } from '../../../engine/engine';
import { usePidSimState } from '../usePidSimState';
import { PidDiagram, Overlay, Slider, type SliderSpec } from '../PidPrimitives';
import './pid-tune-str.css';

const W = 1000;
const H = 380;

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
const FB_Y     = 330;

const TUNER     = { x: 647, y: 200, w: 220, h: 80 };
const TUNER_HEADER_H = 30;
const U_TAP_X   = 663;
const Y_TAP_X   = 850;

const SETPOINT_SLIDER: SliderSpec = { field: 'target', label: 'Target', min: -5, max: 5, step: 0.05 };
const KP_SLIDER:       SliderSpec = { field: 'kp',     label: 'P:',     min: 0,  max: 10, step: 0.1 };
const KI_SLIDER:       SliderSpec = { field: 'ki',     label: 'I:',     min: 0,  max: 5,  step: 0.05 };
const KD_SLIDER:       SliderSpec = { field: 'kd',     label: 'D:',     min: 0,  max: 5,  step: 0.05 };
const MASS_SLIDER:     SliderSpec = { field: 'mass',   label: 'M:',     min: 0.1, max: 5, step: 0.1 };
const DAMP_SLIDER:     SliderSpec = { field: 'damping',label: 'D:',     min: 0,  max: 2,  step: 0.05 };

export default function PidTuneStrVis() {
  const { simId, rewindTick } = useSimVis();
  const { isRewinding, readBlock, readNum, handleChange } = usePidSimState(simId, rewindTick);

  const errorVal   = readNum(['setpoint', 'signal_error']);
  const controlVal = readNum(['controller', 'control']);
  const outputVal  = readNum(['plant', 'out']);

  const tunerEnabledRaw = readBlock('tuner').enabled;
  const tunerEnabled = typeof tunerEnabledRaw === 'number' ? tunerEnabledRaw > 0.5 : true;
  const kpStr = readNum(['tuner', 'kp_str']);
  const kiStr = readNum(['tuner', 'ki_str']);
  const kdStr = readNum(['tuner', 'kd_str']);
  const kpApplied = readNum(['tuner', 'kp']);
  const kiApplied = readNum(['tuner', 'ki']);
  const kdApplied = readNum(['tuner', 'kd']);

  const toggleAuto = () => {
    if (isRewinding) return;
    if (tunerEnabled) {
      setInput(simId, 'controller.kp', kpApplied);
      setInput(simId, 'controller.ki', kiApplied);
      setInput(simId, 'controller.kd', kdApplied);
    }
    setInput(simId, 'tuner.enabled', tunerEnabled ? 0 : 1);
  };

  const handleRetune = () => {
    if (isRewinding) return;
    setInput(simId, 'tuner.retune_signal', Date.now());
  };

  const pidSlidersDisabled = isRewinding || tunerEnabled;

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
          <marker id="arrowhead-tune" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffaa44" />
          </marker>
        </defs>

        {/* Main blocks */}
        <rect x={SETPOINT.x} y={SETPOINT.y} width={SETPOINT.w} height={SETPOINT.h}
              className="pid-block__box" rx="6" />
        <rect x={PID.x}      y={PID.y}      width={PID.w}      height={PID.h}
              className="pid-block__box" rx="6" />
        <rect x={PLANT.x}    y={PLANT.y}    width={PLANT.w}    height={PLANT.h}
              className="pid-block__box" rx="6" />

        {/* Tuner block */}
        <rect x={TUNER.x} y={TUNER.y} width={TUNER.w} height={TUNER.h}
              className="pid-block__box" rx="6" />
        <line x1={TUNER.x} y1={TUNER.y + TUNER_HEADER_H}
              x2={TUNER.x + TUNER.w} y2={TUNER.y + TUNER_HEADER_H}
              className="pid-block__divider" />

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

        {/* Tuner taps */}
        <line x1={U_TAP_X} y1={SUM.cy} x2={U_TAP_X} y2={TUNER.y}
              className="pid-wire pid-wire--tap" markerEnd="url(#arrowhead)" />
        <circle cx={U_TAP_X} cy={SUM.cy} r="3.5" className="pid-junction-dot" />
        <line x1={Y_TAP_X} y1={SUM.cy} x2={Y_TAP_X} y2={TUNER.y}
              className="pid-wire pid-wire--tap" markerEnd="url(#arrowhead)" />
        <circle cx={Y_TAP_X} cy={SUM.cy} r="3.5" className="pid-junction-dot" />

        {/* Gain-adjustment arrow */}
        <polyline
          points={`${TUNER.x},${TUNER.y + TUNER.h / 2} ${PID.x + PID.w / 2},${TUNER.y + TUNER.h / 2} ${PID.x + PID.w / 2},${PID.y + PID.h}`}
          className={`pid-wire pid-wire--adjust${tunerEnabled ? '' : ' pid-wire--adjust-off'}`}
          markerEnd="url(#arrowhead-tune)" />
        <text x={(TUNER.x + PID.x + PID.w / 2) / 2}
              y={TUNER.y + TUNER.h / 2 - 6}
              className="pid-signal pid-signal--adjust" textAnchor="middle">
          adjust gains
        </text>

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
              className="pid-title" textAnchor="middle">PID</text>
        <text x={PLANT.x + PLANT.w / 2} y={PLANT.y + 22}
              className="pid-title" textAnchor="middle">Plant</text>
        <text x={TUNER.x + 12} y={TUNER.y + 21}
              className="pid-title" textAnchor="start">Tuner</text>
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
                value={tunerEnabled ? kpApplied : readBlock('controller')[KP_SLIDER.field]}
                disabled={pidSlidersDisabled}
                onChange={v => handleChange('controller', KP_SLIDER.field, v)} />
      </Overlay>
      <Overlay x={350} y={100} w={148} h={30}>
        <Slider spec={KI_SLIDER}
                value={tunerEnabled ? kiApplied : readBlock('controller')[KI_SLIDER.field]}
                disabled={pidSlidersDisabled}
                onChange={v => handleChange('controller', KI_SLIDER.field, v)} />
      </Overlay>
      <Overlay x={350} y={130} w={148} h={30}>
        <Slider spec={KD_SLIDER}
                value={tunerEnabled ? kdApplied : readBlock('controller')[KD_SLIDER.field]}
                disabled={pidSlidersDisabled}
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

      <Overlay x={TUNER.x + 75} y={TUNER.y + 4} w={60} h={22}>
        <button
          className="pid-switch pid-switch--retune"
          onClick={handleRetune}
          disabled={isRewinding}
        >
          RE-TUNE
        </button>
      </Overlay>

      <Overlay x={TUNER.x + 140} y={TUNER.y + 4} w={70} h={22}>
        <button
          className={`pid-switch${tunerEnabled ? ' pid-switch--on' : ' pid-switch--off'}`}
          onClick={toggleAuto}
          disabled={isRewinding}
        >
          {tunerEnabled ? 'AUTO' : 'MANUAL'}
        </button>
      </Overlay>

      <Overlay x={TUNER.x + 12} y={TUNER.y + TUNER_HEADER_H + 8} w={TUNER.w - 24} h={TUNER.h - TUNER_HEADER_H - 16}>
        <div className="pid-tuner-readouts">
          <div className="pid-tuner-readout">
            <span className="pid-tuner-readout__label">Kp:</span>
            <span className="pid-tuner-readout__value">{kpStr.toFixed(2)}</span>
          </div>
          <div className="pid-tuner-readout">
            <span className="pid-tuner-readout__label">Ki:</span>
            <span className="pid-tuner-readout__value">{kiStr.toFixed(2)}</span>
          </div>
          <div className="pid-tuner-readout">
            <span className="pid-tuner-readout__label">Kd:</span>
            <span className="pid-tuner-readout__value">{kdStr.toFixed(2)}</span>
          </div>
        </div>
      </Overlay>
    </PidDiagram>
  );
}
