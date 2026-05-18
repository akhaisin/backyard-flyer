import { incConfig } from './models/inc/inc.config';
import { floaterConfig } from './models/floater/floater.config';
import { floaterPidConfig } from './models/floater-pid/floater-pid.config';
import { pidTutorialConfig } from './models/pid-tutorial/pid-tutorial.config';
import type { ModelConfig } from './engine/types';

export const modelRegistry: Record<string, ModelConfig> = {
  inc: incConfig,
  floater: floaterConfig,
  'floater-pid': floaterPidConfig,
  'pid-tutorial': pidTutorialConfig,
};
