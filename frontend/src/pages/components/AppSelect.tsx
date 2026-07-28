import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';

export type AppSelectOption = {
  value: string;
  label?: string;
  description?: string;
  meta?: string;
  color?: string;
  disabled?: boolean;
  keywords?: string[];
  isCustom?: boolean;
  primary?: boolean;
};

type AppSelectProps = {
  id?: string;
  name?: string;
  ariaLabel: string;
  value: string;
  options: AppSelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  width?: string;
  dropdownWidth?: number;
  dropdownAlign?: 'left' | 'center' | 'right';
  dropdownClassName?: string;
  height?: string;
  textAlign?: 'left' | 'center';
  showSelectedMeta?: boolean;
  allowCustom?: boolean;
};

type DropdownPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

const optionText = (option: AppSelectOption) => [
  option.value,
  option.label,
  option.description,
  option.meta,
  ...(option.keywords || [])
].filter(Boolean).join(' ').toLocaleLowerCase();

export function AppSelect({
  id,
  name,
  ariaLabel,
  value,
  options,
  placeholder,
  onChange,
  searchable = false,
  searchPlaceholder = 'Search…',
  disabled = false,
  width = '100%',
  dropdownWidth = 300,
  dropdownAlign = 'center',
  dropdownClassName,
  height = '38px',
  textAlign = 'left',
  showSelectedMeta = true,
  allowCustom = false
}: AppSelectProps) {
  const generatedId = useId().replaceAll(':', '');
  const controlId = id || `app-select-${generatedId}`;
  const listboxId = `${controlId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeIndexSourceRef = useRef<'sync' | 'keyboard' | 'pointer'>('sync');
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0, width: dropdownWidth, maxHeight: 320 });
  const hasSearch = searchable || allowCustom;

  const selectedOption = options.find(option => option.value === value);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? options.filter(option => optionText(option).includes(query)) : options;
  }, [options, search]);
  const visibleOptions = useMemo(() => {
    const customValue = search.trim();
    const exactOption = options.some(option => option.value.toLocaleLowerCase() === customValue.toLocaleLowerCase());
    if (!allowCustom || !customValue || exactOption) return filteredOptions;
    return [{
      value: customValue,
      label: `Create “${customValue}”`,
      description: 'Use a new value',
      isCustom: true
    }, ...filteredOptions];
  }, [allowCustom, filteredOptions, options, search]);
  const selectedVisibleIndex = visibleOptions.findIndex(option => option.value === value && !option.disabled);
  const firstVisibleEnabledIndex = visibleOptions.findIndex(option => !option.disabled);
  const dividerAfterIndex = useMemo(() => {
    let lastPrimaryIndex = -1;
    visibleOptions.forEach((option, index) => {
      if (option.primary) lastPrimaryIndex = index;
    });
    if (
      lastPrimaryIndex < 0
      || !visibleOptions.slice(lastPrimaryIndex + 1).some(option => !option.primary)
    ) return -1;
    return lastPrimaryIndex;
  }, [visibleOptions]);

  const firstEnabledIndex = useCallback((items: AppSelectOption[]) => (
    items.findIndex(option => !option.disabled)
  ), []);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportPadding = 8;
    const width = Math.min(dropdownWidth, window.innerWidth - viewportPadding * 2);
    const preferredLeft = dropdownAlign === 'left'
      ? rect.left
      : dropdownAlign === 'right'
        ? rect.right - width
        : rect.left + (rect.width - width) / 2;
    const left = Math.max(
      viewportPadding,
      Math.min(preferredLeft, window.innerWidth - width - viewportPadding)
    );
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding - 8;
    const availableAbove = rect.top - viewportPadding - 8;
    const openBelow = availableBelow >= 210 || availableBelow >= availableAbove;
    const maxHeight = Math.max(180, Math.min(340, openBelow ? availableBelow : availableAbove));
    const top = openBelow ? rect.bottom + 8 : undefined;
    const bottom = openBelow ? undefined : window.innerHeight - rect.top + 8;

    setPosition({ top, bottom, left, width, maxHeight });
  }, [dropdownAlign, dropdownWidth]);

  const open = useCallback((preferredDirection: 1 | -1 = 1) => {
    if (disabled) return;
    activeIndexSourceRef.current = 'sync';
    updatePosition();
    setSearch('');
    setIsOpen(true);

    const selectedIndex = options.findIndex(option => option.value === value && !option.disabled);
    if (selectedIndex >= 0) {
      setActiveIndex(selectedIndex);
      return;
    }
    if (preferredDirection === 1) {
      setActiveIndex(firstEnabledIndex(options));
      return;
    }
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index].disabled) {
        setActiveIndex(index);
        return;
      }
    }
  }, [disabled, firstEnabledIndex, options, updatePosition, value]);

  const close = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    setSearch('');
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    }
  }, []);

  const moveActive = useCallback((direction: 1 | -1) => {
    if (visibleOptions.length === 0) return;
    activeIndexSourceRef.current = 'keyboard';
    let index = activeIndex;
    for (let step = 0; step < visibleOptions.length; step += 1) {
      index = (index + direction + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[index].disabled) {
        setActiveIndex(index);
        return;
      }
    }
  }, [activeIndex, visibleOptions]);

  const select = useCallback((option: AppSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close(true);
  }, [close, onChange]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) close();
    };
    const handlePositionChange = () => updatePosition();

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handlePositionChange);
    window.addEventListener('scroll', handlePositionChange, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handlePositionChange);
      window.removeEventListener('scroll', handlePositionChange, true);
    };
  }, [close, isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    activeIndexSourceRef.current = 'sync';
    setActiveIndex(selectedVisibleIndex >= 0 ? selectedVisibleIndex : firstVisibleEnabledIndex);
  }, [firstVisibleEnabledIndex, isOpen, search, selectedVisibleIndex, value]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0 || activeIndexSourceRef.current === 'pointer') return;
    const optionsElement = optionsRef.current;
    const activeOption = document.getElementById(`${controlId}-option-${activeIndex}`);
    if (!optionsElement || !activeOption) return;

    const optionTop = activeOption.offsetTop - optionsElement.offsetTop;
    const optionBottom = optionTop + activeOption.offsetHeight;
    const visibleTop = optionsElement.scrollTop;
    const visibleBottom = visibleTop + optionsElement.clientHeight;
    const scrollPadding = 3;
    if (optionTop < visibleTop + scrollPadding) {
      optionsElement.scrollTop = Math.max(0, optionTop - scrollPadding);
    } else if (optionBottom > visibleBottom - scrollPadding) {
      optionsElement.scrollTop = optionBottom - optionsElement.clientHeight + scrollPadding;
    }
  }, [activeIndex, controlId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const focusTarget = hasSearch ? searchInputRef.current : optionsRef.current;
    requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
  }, [hasSearch, isOpen]);

  const handleNavigationKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      activeIndexSourceRef.current = 'keyboard';
      setActiveIndex(firstEnabledIndex(visibleOptions));
    } else if (event.key === 'End') {
      event.preventDefault();
      activeIndexSourceRef.current = 'keyboard';
      for (let index = visibleOptions.length - 1; index >= 0; index -= 1) {
        if (!visibleOptions[index].disabled) {
          setActiveIndex(index);
          break;
        }
      }
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) select(option);
    }
  };

  const dropdown = isOpen ? createPortal(
    <div
      ref={dropdownRef}
      className={`app-select-dropdown${dropdownClassName ? ` ${dropdownClassName}` : ''}`}
      data-escape-guard="true"
      style={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight
      }}
    >
      {hasSearch && (
        <label className="app-select-search">
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchInputRef}
            id={`${controlId}-search`}
            name={`${name || controlId}-search`}
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={handleNavigationKey}
            placeholder={allowCustom ? 'Search or create…' : searchPlaceholder}
            aria-label={`${ariaLabel} search`}
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${controlId}-option-${activeIndex}` : undefined}
          />
        </label>
      )}
      <div
        id={listboxId}
        className="app-select-options"
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={activeIndex >= 0 ? `${controlId}-option-${activeIndex}` : undefined}
        tabIndex={hasSearch ? -1 : 0}
        onKeyDown={handleNavigationKey}
        ref={optionsRef}
      >
        {visibleOptions.map((option, index) => {
          const selected = option.value === value;
          const active = index === activeIndex;
          return (
            <button
              id={`${controlId}-option-${index}`}
              key={option.value}
              type="button"
              className={`app-select-option${option.color ? ' has-color' : ''}${option.isCustom ? ' is-custom' : ''}${index === dividerAfterIndex ? ' has-divider-after' : ''}${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
              role="option"
              aria-selected={selected}
              disabled={option.disabled}
              onMouseEnter={() => {
                if (!option.disabled) {
                  activeIndexSourceRef.current = 'pointer';
                  setActiveIndex(index);
                }
              }}
              onClick={() => select(option)}
            >
              {option.color && (
                <span className="app-select-option-color" style={{ backgroundColor: option.color }} aria-hidden="true" />
              )}
              <span className="app-select-option-copy">
                <strong>{option.isCustom && <Plus size={13} aria-hidden="true" />}{option.label || option.value}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {option.meta && <span className="app-select-option-meta">{option.meta}</span>}
              <span className="app-select-option-check" aria-hidden="true">
                {selected && <Check size={15} />}
              </span>
            </button>
          );
        })}
        {visibleOptions.length === 0 && (
          <div className="app-select-empty">No matching options</div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="app-select" style={{ width }}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        className={`input app-select-trigger${isOpen ? ' is-open' : ''}`}
        style={{ height, textAlign }}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open(event.key === 'ArrowDown' ? 1 : -1);
          } else if ((event.key === 'Enter' || event.key === ' ') && !isOpen) {
            event.preventDefault();
            open();
          } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <span
          className="app-select-trigger-copy"
          style={{ justifyContent: textAlign === 'center' ? 'center' : 'flex-start' }}
        >
          {selectedOption?.color && (
            <span className="app-select-trigger-color" style={{ backgroundColor: selectedOption.color }} aria-hidden="true" />
          )}
          <strong>{selectedOption?.label || selectedOption?.value || value || placeholder}</strong>
          {showSelectedMeta && selectedOption?.meta && <small>{selectedOption.meta}</small>}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {dropdown}
    </div>
  );
}
