import { incConfig } from './models/demo/inc/inc.config';
import { floaterConfig } from './models/quad/floater/floater.config';
import { floaterPidConfig } from './models/quad/floater-pid/floater-pid.config';
import { pidTutorialConfig } from './models/control/pid-tutorial/pid-tutorial.config';
import { pidTuneStrConfig } from './models/control/pid-tune-str/pid-tune-str.config';
import { pidTuneRelayConfig } from './models/control/pid-tune-relay/pid-tune-relay.config';
import { quadL1Config } from './models/quad/quad-l1/quad-l1.config';
import { quadL2Config } from './models/quad/quad-l2/quad-l2.config';
import { quadL3Config } from './models/quad/quad-l3/quad-l3.config';
import { quadL4Config } from './models/quad/quad-l4/quad-l4.config';
import { quadNoiseConfig } from './models/quad/quad-noise/quad-noise.config';
import { quadW1aConfig } from './models/quad/quad-w1a/quad-w1a.config';
import { quadW1bConfig } from './models/quad/quad-w1b/quad-w1b.config';
import { quadW1CombinedConfig } from './models/quad/quad-w1-combined/quad-w1-combined.config';
import { quadC1aConfig } from './models/quad/quad-c1a/quad-c1a.config';
import { quadC1bConfig } from './models/quad/quad-c1b/quad-c1b.config';
import { quadC2aConfig } from './models/quad/quad-c2a/quad-c2a.config';
import { quadLadderConfig } from './models/racing/quad-ladder/quad-ladder.config';
import { quadPoleConfig } from './models/racing/quad-pole/quad-pole.config';
import { quadRatesConfig } from './models/racing/quad-rates/quad-rates.config';
import type { ModelConfig } from './engine/types';

// A model is either a ready config (singleton) or a factory that builds a config
// per simulation instance — used by models that accept per-instance const
// overrides (e.g. quad-l4's createQuadL4Config). resolveSimContext calls the
// factory; see useSim.ts.
export type ModelEntry = ModelConfig | ((overrides?: Record<string, unknown>) => ModelConfig);

export const modelRegistry: Record<string, ModelEntry> = {
  'demo/inc': incConfig,
  'quad/floater': floaterConfig,
  'quad/floater-pid': floaterPidConfig,
  'control/pid-tutorial': pidTutorialConfig,
  'control/pid-tune-str': pidTuneStrConfig,
  'control/pid-tune-relay': pidTuneRelayConfig,
  'quad/quad-l1': quadL1Config,
  'quad/quad-l2': quadL2Config,
  'quad/quad-l3': quadL3Config,
  'quad/quad-l4': quadL4Config,
  'quad/quad-noise': quadNoiseConfig,
  'quad/quad-w1a':   quadW1aConfig,
  'quad/quad-w1b':        quadW1bConfig,
  'quad/quad-w1-combined': quadW1CombinedConfig,
  'quad/quad-c1a':         quadC1aConfig,
  'quad/quad-c1b':         quadC1bConfig,
  'quad/quad-c2a':         quadC2aConfig,
  'racing/quad-ladder':    quadLadderConfig,
  'racing/quad-pole':      quadPoleConfig,
  'racing/quad-rates':     quadRatesConfig,
};
