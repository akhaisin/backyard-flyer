export interface CatalogSelection {
  forPageId: string;
  modelId: string;
}

type Listener = (sel: CatalogSelection | null) => void;
let _current: CatalogSelection | null = null;
const _listeners = new Set<Listener>();

export function setCatalogModel(forPageId: string, modelId: string): void {
  _current = { forPageId, modelId };
  for (const l of _listeners) l(_current);
}

export function subscribeCatalogModel(listener: Listener): () => void {
  _listeners.add(listener);
  if (_current !== null) listener(_current);
  return () => _listeners.delete(listener);
}
