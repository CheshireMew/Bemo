<template>
  <div class="sidebar-content">
    <UserProfile :show-close="showClose" @close="emit('close')" />
    <MiniCalendar />
    <Heatmap />
    <NavMenu @navigate="emit('navigate')">
      <template #taglist>
        <TagList />
      </template>
    </NavMenu>
    <AiChatModal />
  </div>
</template>

<script setup lang="ts">
import AiChatModal from '../../AiChatModal.vue';
import UserProfile from '../../Sidebar/UserProfile.vue';
import MiniCalendar from '../../Sidebar/MiniCalendar.vue';
import Heatmap from '../../Sidebar/Heatmap.vue';
import NavMenu from '../../Sidebar/NavMenu.vue';
import TagList from '../../Sidebar/TagList.vue';

withDefaults(defineProps<{
  showClose?: boolean;
}>(), {
  showClose: false,
});

const emit = defineEmits<{
  close: [];
  navigate: [];
}>();
</script>

<style scoped>
.sidebar-content {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
</style>
