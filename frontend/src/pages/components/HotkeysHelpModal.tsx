import { X } from 'lucide-react';
import { NAVIGATION_HOTKEYS } from '../../lib/hotkeys';
import { ModalPortal } from './ModalPortal';

type HotkeysHelpModalProps = {
  onClose: () => void;
};

const panelStyle = { width: '660px', maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto' as const, padding: '22px 24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' };
const sectionsStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px 28px', alignItems: 'start' };
const rowStyle = { display: 'grid', gridTemplateColumns: '72px 1fr', alignItems: 'center', gap: '12px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' };
const keyStyle = { justifySelf: 'start', minWidth: '32px', textAlign: 'center' as const, padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(var(--surface-rgb), 0.8)', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' };

const sections = [
  {
    title: 'Navigation',
    rows: [...NAVIGATION_HOTKEYS.map(hotkey => [hotkey.label, hotkey.description]), ['H', 'Show this help']]
  },
  {
    title: 'Dashboard',
    rows: [['C', 'Copy latest snapshot']]
  },
  {
    title: 'Popups',
    rows: [['E', 'Edit snapshot from notes'], ['D', 'Toggle changes only in diff'], ['Esc', 'Close popup']]
  }
];

export function HotkeysHelpModal({ onClose }: HotkeysHelpModalProps) {
  return (
    <ModalPortal onClose={onClose} closeOnEscape>
      <div className="glass-panel" style={panelStyle} onClick={event => event.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ margin: 0, fontSize: '18px' }}>Keyboard Shortcuts</h3>
          <button className="btn" style={{ padding: '4px' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={sectionsStyle}>
          {sections.map(section => (
            <div key={section.title}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                {section.title}
              </div>
              {section.rows.map(([key, description]) => (
                <div key={key} style={rowStyle}>
                  <span style={keyStyle}>{key}</span>
                  <span style={{ fontSize: '14px' }}>{description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </ModalPortal>
  );
}
