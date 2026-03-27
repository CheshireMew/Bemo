<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>回收站</h3>
        <p>不常用的删除内容放在这里，需要时再集中查看和处理。</p>
      </div>
    </div>

    <TrashContent embedded :show-header="false" />
  </section>
</template>

<script setup lang="ts">
import TrashContent from './MainFeed/TrashContent.vue';
</script>
