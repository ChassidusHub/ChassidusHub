import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, ExternalLink } from 'lucide-react';
import { useTranslation } from '../i18n/useLanguage';

export interface EditionChoice {
  source: number;
  label: string;
}

export interface EditionLink {
  source: number;
  label: string;
  url: string;
}

interface Props {
  editions: EditionChoice[];
  current: number;
  /** Editions read on Sefaria's own site, not here. */
  links: EditionLink[];
  onChoose: (source: number) => void;
}

/**
 * The chapter's edition, one quiet line under its heading: the edition
 * being read, which opens a menu of the others (and of the ones read on
 * Sefaria). Set in the reader's own paper. Same as the phone's.
 */
export function EditionPicker({ editions, current, links, onChoose }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const shown = editions.find((e) => e.source === current);

  // A click outside the menu, or Escape, closes it; Escape hands the focus back to its button.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (editions.length < 2 && links.length === 0) return null;

  const choose = (source: number) => {
    setOpen(false);
    if (source !== current) onChoose(source);
  };

  return (
    <div className="edition-picker" ref={root}>
      <button
        ref={button}
        type="button"
        className="edition-picker-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t.readerEdition}: ${shown?.label ?? ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{shown?.label ?? t.readerEdition}</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <div className="edition-picker-menu" id={menuId}>
          <p className="edition-picker-title">{t.readerEdition}</p>
          <ul>
            {editions.map((e) => {
              const selected = e.source === current;
              return (
                <li key={e.source}>
                  <button type="button" className={selected ? 'edition-picker-option edition-picker-selected' : 'edition-picker-option'} aria-current={selected ? 'true' : undefined} onClick={() => choose(e.source)}>
                    <span>{e.label}</span>
                    {selected && <Check size={16} aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          {links.length > 0 && (
            <>
              <p className="edition-picker-title edition-picker-links">{t.readerEditionLinks}</p>
              <ul>
                {links.map((e) => (
                  <li key={e.source}>
                    <a className="edition-picker-option" href={e.url} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                      <span>{e.label}</span>
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
