import { incConfig } from './models/inc/inc.config';
import { floaterConfig } from './models/floater/floater.config';
import type { ModelConfig } from './engine/types';

export const modelRegistry: Record<string, ModelConfig> = {
  inc: incConfig,
  floater: floaterConfig,
};
