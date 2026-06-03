export interface SourceSelection {
  simId: string;
  sourceId: string;
}

type Listener = (sel: SourceSelection | null) => void;
let _current: SourceSelection | null = null;
const _listeners = new Set<Listener>();

export function selectSource(simId: string, sourceId: string): void {
  _current = { simId, sourceId };
  for (const l of _listeners) l(_current);
}

export function clearSourceSelection(): void {
  _current = null;
  for (const l of _listeners) l(null);
}

export function subscribeSourceSelection(listener: Listener): () => void {
  _listeners.add(listener);
  if (_current !== null) listener(_current);
  return () => _listeners.delete(listener);
}
