import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Search } from 'lucide-react';

type SearchableSelectProps = {
  id?: string;
  ariaLabel?: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  showSearch?: boolean;
  width?: string;
  dropdownWidth?: string;
  height?: string;
  disabled?: boolean;
  textAlign?: 'left' | 'center';
  portal?: boolean;
  portalZIndex?: number;
  allowCustom?: boolean;
};

const triggerStyle = { padding: '4px 8px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' as const, height: '28px' };
const dropdownStyle = { position: 'absolute' as const, top: '36px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: '140px', maxHeight: '200px', overflowY: 'auto' as const, padding: '4px', background: 'rgba(15, 23, 42, 0.98)', border: '1px solid rgba(148, 163, 184, 0.35)', boxShadow: '0 18px 36px -12px rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column' as const, gap: '2px' };
const searchIconStyle = { position: 'absolute' as const, left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 };
const searchInputStyle = { width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '2px 6px 2px 22px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' };
const optionsStyle = { overflowY: 'auto' as const, flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '2px' };

export function SearchableSelect({ id, ariaLabel, value, onChange, options, placeholder, showSearch = true, width = '100px', dropdownWidth = '140px', height = '28px', disabled = false, textAlign = 'center', portal = false, portalZIndex = 10000, allowCustom = false }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [portalPosition, setPortalPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePortalPosition = useCallback(() => {
    if (!portal) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportPadding = 8;
    const estimatedDropdownHeight = 208;
    const parsedDropdownWidth = Number.parseFloat(dropdownWidth);
    const actualDropdownWidth = Number.isFinite(parsedDropdownWidth) ? parsedDropdownWidth : rect.width;
    const preferredLeft = rect.left + (rect.width - actualDropdownWidth) / 2;
    const left = Math.max(viewportPadding, Math.min(preferredLeft, window.innerWidth - actualDropdownWidth - viewportPadding));
    const preferredTop = rect.bottom + 8;
    const top = preferredTop + estimatedDropdownHeight <= window.innerHeight - viewportPadding
      ? preferredTop
      : Math.max(viewportPadding, rect.top - estimatedDropdownHeight - 8);
    setPortalPosition({ top, left });
  }, [dropdownWidth, portal]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current
        && !containerRef.current.contains(target)
        && !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !portal) return;
    updatePortalPosition();
    window.addEventListener('resize', updatePortalPosition);
    window.addEventListener('scroll', updatePortalPosition, true);
    return () => {
      window.removeEventListener('resize', updatePortalPosition);
      window.removeEventListener('scroll', updatePortalPosition, true);
    };
  }, [isOpen, portal, updatePortalPosition]);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );
  const customValue = search.trim();
  const exactOption = options.find(option => option.toLowerCase() === customValue.toLowerCase());
  const canCreate = allowCustom && customValue !== '' && !exactOption;

  const selectOption = (option: string) => {
    onChange(option);
    setSearch('');
    setIsOpen(false);
  };

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className="glass-panel"
      style={portal
        ? { ...dropdownStyle, position: 'fixed', top: `${portalPosition.top}px`, left: `${portalPosition.left}px`, transform: 'none', width: dropdownWidth, zIndex: portalZIndex }
        : { ...dropdownStyle, top: `calc(${height} + 8px)`, width: dropdownWidth }}
    >
      {showSearch && (
        <div style={{ position: 'relative', padding: '2px', marginBottom: '4px' }}>
          <Search size={12} style={searchIconStyle} />
          <input
            type="text"
            aria-label={`${ariaLabel || placeholder} search`}
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setIsOpen(false);
                return;
              }
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && (exactOption || canCreate || filteredOptions[0])) {
                event.preventDefault();
                const option = exactOption || (canCreate ? customValue : filteredOptions[0]);
                if (option) selectOption(option);
              }
            }}
            placeholder={allowCustom ? 'Search or create...' : 'Search...'}
            autoFocus
            style={searchInputStyle}
          />
        </div>
      )}

      <div style={optionsStyle}>
        {canCreate && (
          <div
            role="option"
            aria-selected="false"
            onClick={() => selectOption(customValue)}
            style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
            className="hover:bg-[rgba(255,255,255,0.05)]"
          >
            <Plus size={13} /> Create “{customValue}”
          </div>
        )}
        {filteredOptions.map(option => (
          <div
            key={option}
            onClick={() => selectOption(option)}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              textAlign,
              background: option === value ? 'var(--accent)' : 'transparent',
              color: option === value ? '#000' : 'var(--text-primary)',
              fontWeight: option === value ? 600 : 'normal',
              transition: 'background 0.15s'
            }}
            className="hover:bg-[rgba(255,255,255,0.05)]"
          >
            {option}
          </div>
        ))}
        {filteredOptions.length === 0 && !canCreate && (
          <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
            No results
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', width, opacity: disabled ? 0.5 : 1 }}>
      <div
        id={id}
        onClick={() => {
          if (disabled) return;
          updatePortalPosition();
          setIsOpen(!isOpen);
          setSearch('');
        }}
        onKeyDown={event => {
          if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          updatePortalPosition();
          setIsOpen(!isOpen);
          setSearch('');
        }}
        className="input"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        style={{ ...triggerStyle, height, cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, textAlign }}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5, marginLeft: '4px' }} />
      </div>

      {portal && dropdown ? createPortal(dropdown, document.body) : dropdown}
    </div>
  );
}
