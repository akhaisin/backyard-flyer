import { incConfig } from './models/demo/inc/inc.config';
import { floaterConfig } from './models/quad/floater/floater.config';
import { floaterPidConfig } from './models/quad/floater-pid/floater-pid.config';
import { pidTutorialConfig } from './models/control/pid-tutorial/pid-tutorial.config';
import { pidTuneStrConfig } from './models/control/pid-tune-str/pid-tune-str.config';
import { pidTuneRelayConfig } from './models/control/pid-tune-relay/pid-tune-relay.config';
import { quadL1Config } from './models/quad/quad-l1/quad-l1.config';
import { quadL2Config } from './models/quad/quad-l2/quad-l2.config';
import { quadNoiceConfig } from './models/quad/quad-noice/quad-noice.config';
import { quadW1Config } from './models/quad/quad-w1/quad-w1.config';
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
  'quad/quad-noice': quadNoiceConfig,
  'quad/quad-w1':    quadW1Config,
};
