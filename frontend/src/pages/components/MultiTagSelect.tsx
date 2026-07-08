import { useEffect, useState, useRef } from 'react';
import { X, Check } from 'lucide-react';
// Changed path from '../types' to '../../types'
import { getTagColor } from '../../types';

interface MultiTagSelectProps {
  selectedTags: string[];
  availableTags: string[];
  onChange: (tags: string[]) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export function MultiTagSelect({
  selectedTags,
  availableTags,
  onChange,
  onOpen,
  onClose
}: MultiTagSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isOpen) {
          setIsOpen(false);
          if (onClose) onClose();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter(t => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  const handleToggleOpen = () => {
    if (isOpen) {
      setIsOpen(false);
      if (onClose) onClose();
    } else {
      setIsOpen(true);
      if (onOpen) onOpen();
    }
  };

  const visibleTags = selectedTags.slice(0, 2);
  const hiddenTagsCount = selectedTags.length - 2;

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        width: '100%',
        zIndex: isOpen ? 50 : 1
      }}
    >
      <div
        className="flex gap-1 items-center cursor-pointer"
        style={{
          height: '38px',
          padding: '0 10px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--glass-border)',
          borderRadius: '6px',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'space-between'
        }}
        onClick={handleToggleOpen}
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
                flexShrink: 0
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleTag(tag);
              }}
            >
              {tag}
              <X size={11} style={{ opacity: 0.8 }} />
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
      </div>

      {isOpen && availableTags.length > 0 && (
        <div
          className="absolute mt-1.5 glass-panel"
          style={{
            zIndex: 100,
            minWidth: '280px',
            width: 'max-content',
            maxWidth: '340px',
            maxHeight: '320px',
            overflowY: 'auto',
            boxShadow: '0 20px 40px -5px rgba(0,0,0,0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            padding: '4px',
            background: '#161a23',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '8px',
            right: 0
          }}
        >
          {availableTags.map((tag, index) => {
            const isSelected = selectedTags.includes(tag);
            const isHovered = hoveredTag === tag;

            return (
              <div
                key={tag}
                className="flex items-center justify-between px-4 py-3 rounded-md cursor-pointer"
                style={{
                  fontSize: '15.5px',
                  letterSpacing: '0.2px',
                  marginBottom: index === availableTags.length - 1 ? '0' : '2px',
                  userSelect: 'none',
                  backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.14)' : 'transparent',
                  transition: 'none'
                }}
                onMouseEnter={() => setHoveredTag(tag)}
                onMouseLeave={() => setHoveredTag(null)}
                onClick={() => toggleTag(tag)}
              >
                <div className="flex items-center gap-3">
                  <span style={{
                    display: 'inline-block',
                    width: '12.5px',
                    height: '12.5px',
                    borderRadius: '50%',
                    backgroundColor: getTagColor(tag),
                    boxShadow: '0 0 4px rgba(0,0,0,0.4)'
                  }} />
                  <span style={{
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.85)'
                  }}>{tag}</span>
                </div>
                {isSelected && (
                  <Check
                    size={18}
                    style={{ color: 'var(--accent, #38bdf8)' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
