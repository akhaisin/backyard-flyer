interface Props {
  pageIds: string[];
  currentPage: string;
  onNavigate: (pageId: string) => void;
  tocNames: Record<string, string>;
}

interface TreeNode {
  id?: string;
  children: Record<string, TreeNode>;
}

function buildTree(pageIds: string[]): TreeNode {
  const root: TreeNode = { children: {} };
  for (const id of pageIds) {
    const parts = id.split('/');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.children[part]) node.children[part] = { children: {} };
      node = node.children[part];
    }
    const leaf = parts[parts.length - 1];
    node.children[leaf] = { id, children: {} };
  }
  return root;
}

function TreeNodes({
  nodes,
  currentPage,
  onNavigate,
  tocNames,
}: {
  nodes: Record<string, TreeNode>;
  currentPage: string;
  onNavigate: (id: string) => void;
  tocNames: Record<string, string>;
}) {
  return (
    <ul className="toc-list">
      {Object.entries(nodes)
        .filter(([name]) => name !== 'default')
        .map(([name, node]) => {
          const defaultId = node.children['default']?.id;
          const hasChildren = Object.keys(node.children).some(k => k !== 'default');
          const leafLabel = node.id ? (tocNames[node.id] ?? name) : name;
          const folderLabel = (defaultId ? (tocNames[defaultId] ?? name) : name) + '/';
          return (
            <li key={name} className="toc-item">
              {node.id ? (
                <button
                  onClick={() => onNavigate(node.id!)}
                  className={`toc-leaf${currentPage === node.id ? ' toc-leaf--active' : ''}`}
                >
                  {leafLabel}
                </button>
              ) : defaultId ? (
                <button
                  onClick={() => onNavigate(defaultId)}
                  className={`toc-dir${currentPage === defaultId ? ' toc-leaf--active' : ''}`}
                >
                  {folderLabel}
                </button>
              ) : (
                <span className="toc-dir">{name}/</span>
              )}
              {hasChildren && (
                <TreeNodes nodes={node.children} currentPage={currentPage} onNavigate={onNavigate} tocNames={tocNames} />
              )}
            </li>
          );
        })}
    </ul>
  );
}

export default function TableOfContents({ pageIds, currentPage, onNavigate, tocNames }: Props) {
  const tree = buildTree(pageIds);
  return (
    <nav className="toc">
      <TreeNodes nodes={tree.children} currentPage={currentPage} onNavigate={onNavigate} tocNames={tocNames} />
    </nav>
  );
}
