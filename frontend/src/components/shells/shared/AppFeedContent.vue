<template>
  <div class="feed-container">
    <TrashView v-if="currentView === 'trash'" />
    <RandomWalk v-else-if="currentView === 'random'" />
    <NotesFeed v-else />
  </div>
</template>

<script setup lang="ts">
import TrashView from '../../MainFeed/TrashView.vue';
import RandomWalk from '../../MainFeed/RandomWalk.vue';
import NotesFeed from '../../MainFeed/NotesFeed.vue';
import { currentView } from '../../../store/ui';
</script>

<style scoped>
.feed-container {
  width: 100%;
  max-width: var(--layout-content-width);
  padding: 0 0 calc(64px + var(--safe-bottom));
  margin: 0;
}

@media (max-width: 1023px) {
  .feed-container {
    max-width: var(--layout-content-width-compact);
  }
}

@media (max-width: 767px) {
  .feed-container {
    flex: 1;
    min-height: 0;
    max-width: none;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding-bottom: calc(120px + var(--safe-bottom));
  }
}
</style>
