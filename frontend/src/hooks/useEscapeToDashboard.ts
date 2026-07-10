import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTextInputTarget } from '../lib/hotkeys';

type UseEscapeToDashboardOptions = {
  blocked?: boolean;
  confirmWhen?: boolean;
  confirmMessage?: string;
  onConfirmRequired?: () => void;
};

export function useEscapeToDashboard({
  blocked = false,
  confirmWhen = false,
  confirmMessage = 'You have unsaved changes. Leave without saving?',
  onConfirmRequired
}: UseEscapeToDashboardOptions = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (blocked || event.defaultPrevented || event.key !== 'Escape' || isTextInputTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      if (confirmWhen && onConfirmRequired) {
        onConfirmRequired();
        return;
      }
      if (confirmWhen && !window.confirm(confirmMessage)) return;

      navigate('/');
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [blocked, confirmMessage, confirmWhen, navigate, onConfirmRequired]);
}
