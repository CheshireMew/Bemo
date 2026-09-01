<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>回收站</h3>
        <p>查看和管理已删除的笔记。</p>
      </div>
    </div>

    <TrashContent embedded :show-header="false" />
  </section>
</template>

<script setup lang="ts">
import TrashContent from './MainFeed/TrashContent.vue';
</script>
