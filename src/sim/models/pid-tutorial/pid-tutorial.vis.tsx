import { useEffect, useState } from 'react';
import { useSimVis } from '../../components/SimVis';
import {
  subscribe, subscribeInputs,
  getLiveInputs, getState, getHistory,
  setInput,
} from '../../engine/engine';
import type { ModelState } from '../../engine/types';

type SliderSpec = { field: string; label: string; min: number; max: number; step: number };

const SLIDERS: Record<string, SliderSpec[]> = {
  setpoint: [
    { field: 'target', label: 'Target', min: -2, max: 2, step: 0.05 },
  ],
  controller: [
    { field: 'kp', label: 'Kp', min: 0, max: 10, step: 0.1 },
    { field: 'ki', label: 'Ki', min: 0, max: 5,  step: 0.05 },
    { field: 'kd', label: 'Kd', min: 0, max: 5,  step: 0.05 },
  ],
  plant: [
    { field: 'mass',    label: 'Mass',    min: 0.1, max: 5, step: 0.1 },
    { field: 'damping', label: 'Damping', min: 0,   max: 2, step: 0.05 },
  ],
};

export default function PidTutorialVis() {
  const { simId, rewindTick } = useSimVis();
  const isRewinding = rewindTick !== null;

  const [inputs, setInputsView] = useState<ModelState>(() => getLiveInputs(simId));
  const [stateView, setStateView] = useState<ModelState>(() => getState(simId));

  useEffect(() => {
    if (isRewinding) {
      const snap = getHistory(simId)[rewindTick];
      if (snap) {
        const snapInputs = snap.inputs;
        setInputsView(typeof snapInputs === 'object' && snapInputs !== null ? snapInputs : {});
        setStateView(snap);
      }
      return;
    }
    setInputsView(structuredClone(getLiveInputs(simId)));
    setStateView(getState(simId));
    const unsubInputs = subscribeInputs(simId, (live) => setInputsView(structuredClone(live)));
    const unsubState = subscribe(simId, (state) => setStateView(state));
    return () => { unsubInputs(); unsubState(); };
  }, [simId, isRewinding, rewindTick]);

  const readBlock = (blockId: string): ModelState => {
    const v = inputs[blockId];
    return typeof v === 'object' && v !== null ? v : {};
  };
  const readNum = (path: string[]): number => {
    let cur: ModelState[string] | undefined = stateView;
    for (const p of path) {
      if (typeof cur !== 'object' || cur === null) return 0;
      cur = (cur as ModelState)[p];
    }
    return typeof cur === 'number' ? cur : 0;
  };

  const handleChange = (blockId: string, field: string, value: number) => {
    if (isRewinding) return;
    setInput(simId, `${blockId}.${field}`, value);
  };

  return (
    <div className="pid-diagram">
      <div className="pid-diagram__row">
        <PidBlock
          title="Setpoint"
          readout={[
            { label: 'target',  value: readNum(['inputs', 'setpoint', 'target']) },
            { label: 'error',   value: readNum(['setpoint', 'signal_error']) },
          ]}
          sliders={SLIDERS.setpoint}
          values={readBlock('setpoint')}
          disabled={isRewinding}
          onChange={(f, v) => handleChange('setpoint', f, v)}
        />
        <PidArrow label="error" value={readNum(['setpoint', 'signal_error'])} />
        <PidBlock
          title="Controller (PID)"
          readout={[
            { label: 'control', value: readNum(['controller', 'control']) },
            { label: 'integ.',  value: readNum(['controller', 'integral']) },
          ]}
          sliders={SLIDERS.controller}
          values={readBlock('controller')}
          disabled={isRewinding}
          onChange={(f, v) => handleChange('controller', f, v)}
        />
        <PidArrow label="control" value={readNum(['controller', 'control'])} />
        <PidBlock
          title="Plant"
          readout={[
            { label: 'output',  value: readNum(['plant', 'out']) },
            { label: 'vel',     value: readNum(['plant', 'vel']) },
          ]}
          sliders={SLIDERS.plant}
          values={readBlock('plant')}
          disabled={isRewinding}
          onChange={(f, v) => handleChange('plant', f, v)}
        />
      </div>
      <div className="pid-diagram__feedback">
        ← feedback: plant.out = {readNum(['plant', 'out']).toFixed(3)} →
      </div>
    </div>
  );
}

function PidBlock({ title, readout, sliders, values, disabled, onChange }: {
  title: string;
  readout: { label: string; value: number }[];
  sliders: SliderSpec[];
  values: ModelState;
  disabled: boolean;
  onChange: (field: string, value: number) => void;
}) {
  return (
    <div className="pid-block">
      <div className="pid-block__title">{title}</div>
      <div className="pid-block__readout">
        {readout.map(r => (
          <div className="pid-block__readout-row" key={r.label}>
            <span className="pid-block__readout-label">{r.label}</span>
            <span className="pid-block__readout-value">{r.value.toFixed(3)}</span>
          </div>
        ))}
      </div>
      <div className="pid-block__sliders">
        {sliders.map(spec => {
          const raw = values[spec.field];
          const value = typeof raw === 'number' ? raw : spec.min;
          return (
            <div className="pid-slider" key={spec.field}>
              <label className="pid-slider__label">{spec.label}</label>
              <input
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value}
                disabled={disabled}
                onChange={e => onChange(spec.field, Number(e.target.value))}
                className="pid-slider__input"
              />
              <span className="pid-slider__value">{value.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PidArrow({ label, value }: { label: string; value: number }) {
  return (
    <div className="pid-arrow">
      <div className="pid-arrow__label">{label}</div>
      <div className="pid-arrow__line">→</div>
      <div className="pid-arrow__value">{value.toFixed(2)}</div>
    </div>
  );
}
