<template>
  <div class="mini-calendar">
    <div class="cal-header">
      <button class="cal-nav" @click="prevMonth">&lt;</button>
      <span class="cal-title">{{ calendarTitle }}</span>
      <button class="cal-nav" @click="nextMonth">&gt;</button>
    </div>
    <div class="cal-weekdays">
      <span v-for="w in ['日','一','二','三','四','五','六']" :key="w">{{ w }}</span>
    </div>
    <div class="cal-grid">
      <div 
        v-for="(d, i) in calendarDays" :key="i"
        class="cal-day"
        :class="{ 
          'other-month': d.otherMonth, 
          'today': d.isToday,
          'selected': d.isSelected,
          'has-notes': d.hasNotes
        }"
        @click="selectDate(d.date)"
      >{{ d.day }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { notes, selectedDate, selectDate } from '../../store/notes';

const calendarMonth = ref(new Date());

const calendarTitle = computed(() => {
  const d = calendarMonth.value;
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
});

const prevMonth = () => {
  const d = new Date(calendarMonth.value);
  d.setMonth(d.getMonth() - 1);
  calendarMonth.value = d;
};

const nextMonth = () => {
  const d = new Date(calendarMonth.value);
  d.setMonth(d.getMonth() + 1);
  calendarMonth.value = d;
};

const calendarDays = computed(() => {
  const year = calendarMonth.value.getFullYear();
  const month = calendarMonth.value.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const todayStr = new Date().toDateString();
  const selectedStr = selectedDate.value?.toDateString();
  
  // 笔记日期集合
  const noteDates = new Set<string>();
  notes.value.forEach(n => {
    noteDates.add(new Date(n.created_at * 1000).toDateString());
  });
  
  const days: { day: number, date: Date, otherMonth: boolean, isToday: boolean, isSelected: boolean, hasNotes: boolean }[] = [];
  
  // 填充上月尾巴
  for (let i = 0; i < firstDay.getDay(); i++) {
    const d = new Date(year, month, -firstDay.getDay() + i + 1);
    days.push({ day: d.getDate(), date: d, otherMonth: true, isToday: false, isSelected: false, hasNotes: false });
  }
  
  // 本月
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({ 
      day: i, date: d, otherMonth: false, 
      isToday: d.toDateString() === todayStr,
      isSelected: d.toDateString() === selectedStr,
      hasNotes: noteDates.has(d.toDateString())
    });
  }
  
  // 填充下月开头
  const remaining = 42 - days.length; // 6行
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ day: i, date: d, otherMonth: true, isToday: false, isSelected: false, hasNotes: false });
  }
  
  return days;
});
</script>

<style scoped>
.mini-calendar { width: 100%; margin-bottom: 16px; }
.cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cal-title { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.cal-nav { background: none; border: none; font-size: 0.85rem; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.cal-nav:hover { background: #eaeaea; }
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 4px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-day { 
  text-align: center; font-size: 0.75rem; padding: 4px 0; 
  border-radius: 4px; cursor: pointer; color: var(--text-primary);
  transition: all 0.15s;
}
.cal-day:hover { background: #eaeaea; }
.cal-day.other-month { color: #ccc; }
.cal-day.today { font-weight: 700; color: var(--accent-color); }
.cal-day.selected { background: var(--accent-color); color: white; font-weight: 600; }
.cal-day.has-notes { position: relative; }
.cal-day.has-notes::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: var(--accent-color); }
.cal-day.selected.has-notes::after { background: white; }
</style>
