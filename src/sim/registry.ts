import { incConfig } from './models/demo/inc/inc.config';
import { floaterConfig } from './models/quad/floater/floater.config';
import { floaterPidConfig } from './models/quad/floater-pid/floater-pid.config';
import { pidTutorialConfig } from './models/control/pid-tutorial/pid-tutorial.config';
import { pidTuneStrConfig } from './models/control/pid-tune-str/pid-tune-str.config';
import { pidTuneRelayConfig } from './models/control/pid-tune-relay/pid-tune-relay.config';
import { quadL1Config } from './models/quad/quad-l1/quad-l1.config';
import { quadL2Config } from './models/quad/quad-l2/quad-l2.config';
import { quadL3Config } from './models/quad/quad-l3/quad-l3.config';
import { quadNoiseConfig } from './models/quad/quad-noise/quad-noise.config';
import { quadW1aConfig } from './models/quad/quad-w1a/quad-w1a.config';
import { quadW1bConfig } from './models/quad/quad-w1b/quad-w1b.config';
import { quadW1CombinedConfig } from './models/quad/quad-w1-combined/quad-w1-combined.config';
import { quadLadderConfig } from './models/racing/quad-ladder/quad-ladder.config';
import { quadPoleConfig } from './models/racing/quad-pole/quad-pole.config';
import type { ModelConfig } from './engine/types';

export const modelRegistry: Record<string, ModelConfig> = {
  inc: incConfig,
  floater: floaterConfig,
  'floater-pid': floaterPidConfig,
  'pid-tutorial': pidTutorialConfig,
  'pid-tune-str': pidTuneStrConfig,
  'pid-tune-relay': pidTuneRelayConfig,
  'quad/quad-l1': quadL1Config,
  'quad/quad-l2': quadL2Config,
  'quad/quad-l3': quadL3Config,
  'quad/quad-noise': quadNoiseConfig,
  'quad/quad-w1a':   quadW1aConfig,
  'quad/quad-w1b':        quadW1bConfig,
  'quad/quad-w1-combined': quadW1CombinedConfig,
  'racing/quad-ladder':    quadLadderConfig,
  'racing/quad-pole':      quadPoleConfig,
};
