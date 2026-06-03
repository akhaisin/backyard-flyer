import useLocalStorage from '../hooks/useLocalStorage';
import styles from './Accordion.module.css';

export interface AccordionSection {
  key: string;
  title: string;
  content: React.ReactNode;
  defaultExpanded?: boolean;
}

interface Props {
  sections: AccordionSection[];
  storageKey?: string;
}

export default function Accordion({ sections, storageKey }: Props) {
  const defaults = Object.fromEntries(sections.map(s => [s.key, s.defaultExpanded ?? false]));
  const [expanded, setExpanded] = useLocalStorage<Record<string, boolean>>(
    storageKey ?? '',
    defaults,
  );

  function toggle(key: string) {
    setExpanded({ ...expanded, [key]: !expanded[key] });
  }

  return (
    <div className={styles.accordion}>
      {sections.map(section => (
        <div key={section.key} className={styles.section}>
          <button
            className={styles.header}
            onClick={() => toggle(section.key)}
            aria-expanded={expanded[section.key]}
          >
            <span className={`${styles.chevron} ${expanded[section.key] ? styles.chevronOpen : ''}`}>›</span>
            <span className={styles.title}>{section.title}</span>
          </button>
          {expanded[section.key] && (
            <div className={styles.body}>{section.content}</div>
          )}
        </div>
      ))}
    </div>
  );
}
