import SimSourceComponent from '../sim/components/SimSourceComponent';
import { resolveSimContext } from '../sim/useSim';

interface Props {
  pageName: string;
  simId?: string;
  modelId?: string;
}

export default function SourceTab({ simId, modelId }: Props) {
  const ctx = simId ? resolveSimContext(simId, modelId) : null;
  if (!ctx) return <div className="panel-placeholder">No simulation for this page.</div>;
  return <SimSourceComponent ctx={ctx} />;
}
