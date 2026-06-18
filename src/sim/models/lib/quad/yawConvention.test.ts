import { describe, expect, it } from 'vitest';
import { fc_acro } from './fc_acro';
import { planner_cturn } from './planner_cturn';

describe('quad yaw convention', () => {
  it('fc_acro treats positive aetrYaw as positive body yaw torque', () => {
    const K = {
      MAX_RATE_ROLL_PITCH: Math.PI,
      MAX_RATE_YAW: 2,
      KP_RATE: 0.2,
      KP_RATE_YAW: 0.5,
      MAX_THRUST_N: 10,
      ARM_LENGTH: 0.2,
      K_DRAG: 0.25,
    };

    const positive = fc_acro({
      angularVel: { x: 0, y: 0, z: 0 },
      armed: 1,
      aetrThrottle: 0.5,
      aetrRoll: 0,
      aetrPitch: 0,
      aetrYaw: 1,
      K,
    });
    const negative = fc_acro({
      angularVel: { x: 0, y: 0, z: 0 },
      armed: 1,
      aetrThrottle: 0.5,
      aetrRoll: 0,
      aetrPitch: 0,
      aetrYaw: -1,
      K,
    });

    expect(positive.motors.m1).toBeGreaterThan(positive.motors.m0);
    expect(positive.motors.m3).toBeGreaterThan(positive.motors.m2);
    expect(negative.motors.m1).toBeLessThan(negative.motors.m0);
    expect(negative.motors.m3).toBeLessThan(negative.motors.m2);
  });

  it('planner_cturn emits positive yaw for a counter-clockwise arc', () => {
    const out = planner_cturn({
      pos: { x: 8, y: 3, z: -3 },
      vel: { x: 1, y: 0, z: 0 },
      step: {
        pos: { x: 12, y: 3, z: 0 },
        stepType: 4,
        durationTicks: 70,
        waypoints: [
          { x: 8, y: 3, z: -3 },
          { x: 12, y: 3, z: 0 },
          { x: 8, y: 3, z: 3 },
        ],
      },
      ticksInPhase: 0,
      armed: 1,
      phase: 2,
      attitude: { x: 0, y: 0, z: 0 },
      K: {
        DT: 0.05,
        GRAVITY: 9.81,
        MASS: 1,
        MAX_THRUST_N: 10,
        MAX_RATE_ROLL_PITCH: Math.PI,
        MAX_RATE_YAW: 2 * Math.PI,
      },
    });

    expect(out.active).toBe(1);
    expect(out.yaw).toBeGreaterThan(0);
  });
});