import SimBlocks from '../sim/components/SimBlocks';
import { resolveSimContext } from '../sim/useSim';

interface Props {
  pageName: string;
  simId?: string;
  modelId?: string;
}

export default function BlocksTab({ simId, modelId }: Props) {
  const ctx = simId ? resolveSimContext(simId, modelId) : null;
  if (!ctx) return <div className="panel-placeholder">No simulation for this page.</div>;
  return <SimBlocks ctx={ctx} />;
}
