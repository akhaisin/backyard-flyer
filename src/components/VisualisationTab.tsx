import SimVis from '../sim/components/SimVis';

interface Props {
  pageName: string;
  simId?: string;
  modelId?: string;
}

export default function VisualisationTab({ simId, modelId }: Props) {
  if (!simId) return <div className="panel-placeholder">No simulation for this page.</div>;
  return <SimVis simId={simId} modelId={modelId} />;
}
