import { incConfig } from './models/demo/inc/inc.config';
import { floaterConfig } from './models/floater/floater.config';
import { floaterPidConfig } from './models/floater-pid/floater-pid.config';
import { pidTutorialConfig } from './models/pid-tutorial/pid-tutorial.config';
import { pidTuneStrConfig } from './models/pid-tune-str/pid-tune-str.config';
import { pidTuneRelayConfig } from './models/pid-tune-relay/pid-tune-relay.config';
import { quadL1Config } from './models/quad/quad-l1/quad-l1.config';
import { quadL2Config } from './models/quad/quad-l2/quad-l2.config';
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
};
