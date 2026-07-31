import { useCallback, useEffect, useId, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Search } from 'lucide-react';
// Changed path from '../types' to '../../types'
import { getTagColor } from '../../types';

interface MultiTagSelectProps {
  selectedTags: string[];
  availableTags: string[];
  onChange: (tags: string[]) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

type DropdownPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function MultiTagSelect({
  selectedTags,
  availableTags,
  onChange,
  onOpen,
  onClose
}: MultiTagSelectProps) {
  const generatedId = useId().replaceAll(':', '');
  const listboxId = `snapshot-tags-${generatedId}-listbox`;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    top: 0,
    left: 0,
    width: 280,
    maxHeight: 320
  });

  const updateDropdownPosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportPadding = 8;
    const gap = 6;
    const width = Math.min(340, Math.max(280, rect.width), window.innerWidth - viewportPadding * 2);
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - width - viewportPadding)
    );
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const availableAbove = rect.top - viewportPadding - gap;
    const openBelow = availableBelow >= 180 || availableBelow >= availableAbove;
    const maxHeight = Math.max(140, Math.min(320, openBelow ? availableBelow : availableAbove));
    const top = openBelow ? rect.bottom + gap : undefined;
    const bottom = openBelow ? undefined : window.innerHeight - rect.top + gap;

    setDropdownPosition({ top, bottom, left, width, maxHeight });
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current
        && !containerRef.current.contains(target)
        && !dropdownRef.current?.contains(target)
      ) {
        if (isOpen) close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePositionChange = () => updateDropdownPosition();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    updateDropdownPosition();
    window.addEventListener('resize', handlePositionChange);
    window.addEventListener('scroll', handlePositionChange, true);
    document.addEventListener('keydown', handleKeyDown);
    if (availableTags.length > 7) {
      requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
    }
    return () => {
      window.removeEventListener('resize', handlePositionChange);
      window.removeEventListener('scroll', handlePositionChange, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [availableTags.length, close, isOpen, updateDropdownPosition]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter(t => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  const handleToggleOpen = () => {
    if (isOpen) {
      close();
    } else {
      updateDropdownPosition();
      setSearch('');
      setIsOpen(true);
      if (onOpen) onOpen();
    }
  };

  const visibleTags = selectedTags.slice(0, 1);
  const hiddenTagsCount = selectedTags.length - 1;
  const filteredTags = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? availableTags.filter(tag => tag.toLocaleLowerCase().includes(query))
      : availableTags;
  }, [availableTags, search]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        width: '100%',
        zIndex: isOpen ? 50 : 1
      }}
    >
      <button
        type="button"
        className={`input snapshot-tags-trigger${isOpen ? ' is-open' : ''}`}
        style={{
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
        onClick={handleToggleOpen}
        role="combobox"
        aria-label="Balance tags"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
      >
        {selectedTags.length === 0 && (
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '13px' }}>Tags</span>
        )}

        <div style={{
          display: 'flex',
          gap: '4px',
          overflow: 'hidden',
          alignItems: 'center',
          flex: 1
        }}>
          {visibleTags.map(tag => (
            <span
              key={tag}
              style={{
                fontSize: '12px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 600,
                backgroundColor: getTagColor(tag),
                color: '#f8fafc',
                border: `1px solid ${getTagColor(tag)}90`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                minWidth: 0,
                maxWidth: '100%',
                flexShrink: 1
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleTag(tag);
              }}
            >
              <span className="snapshot-tag-chip-label">{tag}</span>
              <X size={11} style={{ opacity: 0.8, flex: '0 0 auto' }} />
            </span>
          ))}

          {hiddenTagsCount > 0 && (
            <span
              style={{
                fontSize: '12px',
                padding: '2px 5px',
                borderRadius: '4px',
                fontWeight: 700,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--glass-border)',
                flexShrink: 0
              }}
              title={`And ${hiddenTagsCount} more tag(s)`}
            >
              +{hiddenTagsCount}
            </span>
          )}
        </div>
      </button>

      {isOpen && availableTags.length > 0 && createPortal(
        <div
          ref={dropdownRef}
          className="app-select-dropdown snapshot-tag-dropdown"
          data-escape-guard="true"
          style={{
            top: dropdownPosition.top,
            bottom: dropdownPosition.bottom,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            maxHeight: dropdownPosition.maxHeight
          }}
        >
          <div className="snapshot-tag-dropdown-heading">
            <strong>Balance tags</strong>
            <span>{selectedTags.length} selected</span>
          </div>
          {availableTags.length > 7 && (
            <label className="app-select-search">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchInputRef}
                id={`snapshot-tags-${generatedId}-search`}
                name={`snapshot-tags-${generatedId}-search`}
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Find tag…"
                aria-label="Search balance tags"
                aria-controls={listboxId}
              />
            </label>
          )}
          <div
            id={listboxId}
            className="app-select-options"
            role="listbox"
            aria-label="Available tags"
            aria-multiselectable="true"
          >
            {filteredTags.map(tag => {
              const isSelected = selectedTags.includes(tag);

              return (
                <button
                  key={tag}
                  type="button"
                  className={`app-select-option snapshot-tag-option${isSelected ? ' is-selected' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggleTag(tag)}
                >
                  <span
                    className="snapshot-tag-option-color"
                    style={{ backgroundColor: getTagColor(tag) }}
                    aria-hidden="true"
                  />
                  <span className="app-select-option-copy">
                    <strong>{tag}</strong>
                  </span>
                  <span className="app-select-option-check" aria-hidden="true">
                    {isSelected && <Check size={15} />}
                  </span>
                </button>
              );
            })}
            {filteredTags.length === 0 && (
              <div className="app-select-empty">No matching tags</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
