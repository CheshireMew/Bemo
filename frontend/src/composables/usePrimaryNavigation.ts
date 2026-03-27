import { fetchTrash, selectedDate } from '../store/notes';
import { currentView, openAiChat, openRandomWalk, setView } from '../store/ui';

export function usePrimaryNavigation(onNavigate?: () => void) {
  const navigate = () => {
    onNavigate?.();
  };

  const openAllNotes = () => {
    setView('all');
    selectedDate.value = null;
    navigate();
  };

  const openRandomWalkView = () => {
    openRandomWalk();
    navigate();
  };

  const openTrashView = async () => {
    setView('trash');
    await fetchTrash();
    navigate();
  };

  const openDefaultAiChat = () => {
    openAiChat();
    navigate();
  };

  return {
    currentView,
    openAllNotes,
    openRandomWalkView,
    openTrashView,
    openDefaultAiChat,
  };
}
