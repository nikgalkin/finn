import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowDownUp,
  BarChart3,
  Bot,
  Keyboard,
  MessageSquare,
  MoreHorizontal,
  Settings as SettingsIcon,
  Wrench
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { QuickHoverTooltip } from './QuickHoverTooltip';

type NavDestination = {
  route: string;
  label: string;
  icon: LucideIcon;
  hotkey: string;
};

/** Places inside your data. Always on the bar. */
const BAR_DESTINATIONS: NavDestination[] = [
  { route: '/assistant', label: 'Assistant', icon: Bot, hotkey: 'A' },
  { route: '/flow', label: 'Flow', icon: ArrowDownUp, hotkey: 'W' },
  { route: '/graphs', label: 'Graphs', icon: BarChart3, hotkey: 'G' },
  { route: '/feed', label: 'Feed', icon: MessageSquare, hotkey: 'F' }
];

/** Occasional stops that are about the app rather than the data. */
const MENU_DESTINATIONS: NavDestination[] = [
  { route: '/tools', label: 'Tools', icon: Wrench, hotkey: 'T' },
  { route: '/settings', label: 'Settings', icon: SettingsIcon, hotkey: 'S' }
];

type HeaderNavProps = {
  cashFlowEnabled: boolean;
  onShowHotkeys: () => void;
};

export function HeaderNav({ cashFlowEnabled, onShowHotkeys }: HeaderNavProps) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    // The dropdown carries data-escape-guard, so useEscapeToDashboard stands down and the
    // first Escape only closes the menu.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [menuOpen]);

  const destinations = BAR_DESTINATIONS.filter(item => item.route !== '/flow' || cashFlowEnabled);
  const activeMenuDestination = MENU_DESTINATIONS.find(item => item.route === location.pathname);

  return (
    <nav className="app-nav" aria-label="Main">
      {destinations.map(item => {
        const Icon = item.icon;
        const active = location.pathname === item.route;
        return (
          // An empty tooltip stays closed, so the page you are on does not explain itself.
          // On the others it also carries the hotkey, and covers the narrow layout where the
          // media query drops the labels.
          <QuickHoverTooltip key={item.route} text={active ? '' : `${item.label} (${item.hotkey})`}>
            <Link
              to={item.route}
              className={`btn app-nav-item${active ? ' is-active' : ''}`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          </QuickHoverTooltip>
        );
      })}

      <div className="app-nav-menu" ref={menuRef}>
        {/* Stays three dots whatever is open, so the bar never changes width. Being on a page
            from this menu only tints the button; which page it is shows inside the dropdown. */}
        <QuickHoverTooltip text={menuOpen ? '' : activeMenuDestination?.label ?? 'More'}>
          <button
            type="button"
            className={`btn app-nav-item is-icon-only${activeMenuDestination ? ' is-active' : ''}`}
            aria-label="More"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(open => !open)}
          >
            <MoreHorizontal size={18} />
          </button>
        </QuickHoverTooltip>

        {menuOpen && (
          // Plain disclosure rather than role="menu": these are ordinary links and buttons that
          // Tab already reaches, and a menu role would promise arrow-key navigation.
          <div className="app-nav-dropdown glass-panel" data-escape-guard="true">
            {MENU_DESTINATIONS.map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.route;
              return (
                <Link
                  key={item.route}
                  to={item.route}
                  className={`app-nav-dropdown-item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                  <kbd className="app-nav-dropdown-key">{item.hotkey}</kbd>
                </Link>
              );
            })}

            <div className="app-nav-dropdown-separator" />

            <button
              type="button"
              className="app-nav-dropdown-item"
              onClick={() => {
                setMenuOpen(false);
                onShowHotkeys();
              }}
            >
              <Keyboard size={16} />
              <span>Keyboard shortcuts</span>
              <kbd className="app-nav-dropdown-key">H</kbd>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
