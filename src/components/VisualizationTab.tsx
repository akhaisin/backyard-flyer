import SimVisComponent from '../sim/components/SimVisComponent';

interface Props {
  pageName: string;
  simId?: string;
  modelId?: string;
}

export default function VisualizationTab({ simId, modelId }: Props) {
  if (!simId) return <div className="panel-placeholder">No simulation for this page.</div>;
  return <SimVisComponent simId={simId} modelId={modelId} />;
}
