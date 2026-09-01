import { clearSearch, clearSelectedFilters } from '../store/notes';
import { currentView, openRandomWalk, setView } from '../store/ui';

export function usePrimaryNavigation(onNavigate?: () => void) {
  const navigate = () => {
    onNavigate?.();
  };

  const openAllNotes = () => {
    setView('all');
    clearSelectedFilters();
    clearSearch();
    navigate();
  };

  const openRandomWalkView = () => {
    openRandomWalk();
    navigate();
  };

  const openTrashView = () => {
    setView('trash');
    navigate();
  };

  return {
    currentView,
    openAllNotes,
    openRandomWalkView,
    openTrashView,
  };
}
