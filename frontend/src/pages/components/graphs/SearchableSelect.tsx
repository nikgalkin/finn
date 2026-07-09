import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

type SearchableSelectProps = {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
};

export function SearchableSelect({ value, onChange, options, placeholder }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100px' }}>
      <div
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className="input"
        style={{
          padding: '4px 8px',
          background: 'var(--bg-color)',
          border: '1px solid var(--glass-border)',
          borderRadius: '6px',
          fontSize: '13px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
          height: '28px'
        }}
      >
        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, textAlign: 'center' }}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5, marginLeft: '4px' }} />
      </div>

      {isOpen && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '36px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            width: '140px',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '4px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <div style={{ position: 'relative', padding: '2px', marginBottom: '4px' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
            <input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search..."
              autoFocus
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--glass-border)',
                borderRadius: '4px',
                padding: '2px 6px 2px 22px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredOptions.map(option => (
              <div
                key={option}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'center',
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
            {filteredOptions.length === 0 && (
              <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
