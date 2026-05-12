import SimSource from '../sim/components/SimSource';
import { resolveSimContext } from '../sim/useSim';

interface Props {
  pageName: string;
  simId?: string;
  modelId?: string;
}

export default function SourceTab({ simId, modelId }: Props) {
  const ctx = simId ? resolveSimContext(simId, modelId) : null;
  if (!ctx) return <div className="panel-placeholder">No simulation for this page.</div>;
  return <SimSource ctx={ctx} />;
}
