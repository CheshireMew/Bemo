<template>
  <div ref="calendarRoot" class="mini-calendar">
    <div class="cal-header">
      <button class="cal-nav" @click="prevMonth">&lt;</button>
      <button class="cal-title-btn" @click="toggleMonthPicker">
        <span class="cal-title">{{ calendarTitle }}</span>
      </button>
      <div class="cal-header-actions">
        <button class="cal-today-btn" @click="goToCurrentMonth">今天</button>
        <button class="cal-nav" @click="nextMonth">&gt;</button>
      </div>
    </div>
    <div v-if="showMonthPicker" class="month-picker">
      <div class="month-picker-header">
        <button class="cal-nav" @click="changePickerYear(-1)">&lt;</button>
        <span class="picker-year">{{ pickerYear }}年</span>
        <button class="cal-nav" @click="changePickerYear(1)">&gt;</button>
      </div>
      <div class="month-grid">
        <button
          v-for="month in 12"
          :key="month"
          class="month-option"
          :class="{ active: pickerYear === calendarMonth.getFullYear() && month - 1 === calendarMonth.getMonth() }"
          @click="selectMonth(month - 1)"
        >
          {{ month }}月
        </button>
      </div>
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
        @click="handleDateSelect(d.date)"
      >{{ d.day }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';
import { notes, selectedDate, selectDate } from '../../store/notes';

const emit = defineEmits<{
  navigate: [];
}>();

const calendarRoot = ref<HTMLElement | null>(null);
const calendarMonth = ref(new Date());
const showMonthPicker = ref(false);
const pickerYear = ref(calendarMonth.value.getFullYear());

const calendarTitle = computed(() => {
  const d = calendarMonth.value;
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
});

const prevMonth = () => {
  const d = new Date(calendarMonth.value);
  d.setMonth(d.getMonth() - 1);
  calendarMonth.value = d;
  pickerYear.value = d.getFullYear();
};

const nextMonth = () => {
  const d = new Date(calendarMonth.value);
  d.setMonth(d.getMonth() + 1);
  calendarMonth.value = d;
  pickerYear.value = d.getFullYear();
};

const goToCurrentMonth = () => {
  const now = new Date();
  calendarMonth.value = new Date(now.getFullYear(), now.getMonth(), 1);
  pickerYear.value = now.getFullYear();
  showMonthPicker.value = false;
};

const toggleMonthPicker = () => {
  showMonthPicker.value = !showMonthPicker.value;
  pickerYear.value = calendarMonth.value.getFullYear();
};

const changePickerYear = (offset: number) => {
  pickerYear.value += offset;
};

const selectMonth = (month: number) => {
  calendarMonth.value = new Date(pickerYear.value, month, 1);
  showMonthPicker.value = false;
};

const handleDateSelect = (date: Date) => {
  selectDate(date);
  showMonthPicker.value = false;
  emit('navigate');
};

const handleDocumentClick = (event: MouseEvent) => {
  if (!showMonthPicker.value) return;
  const target = event.target as Node | null;
  if (calendarRoot.value && target && !calendarRoot.value.contains(target)) {
    showMonthPicker.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentClick);
});

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
.mini-calendar { width: 100%; margin-bottom: 16px; position: relative; }
.cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cal-header-actions { display: flex; align-items: center; gap: 4px; }
.cal-title { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.cal-title-btn {
  background: none;
  border: none;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.cal-title-btn:hover { background: #eaeaea; }
.cal-today-btn {
  background: none;
  border: none;
  color: var(--accent-color);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}
.cal-today-btn:hover { background: #eaeaea; }
.cal-nav { background: none; border: none; font-size: 0.85rem; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.cal-nav:hover { background: #eaeaea; }
.month-picker {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: min(260px, calc(100vw - 48px));
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  z-index: 20;
}
.month-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.picker-year {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.month-option {
  border: none;
  background: var(--bg-main);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 0;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
}
.month-option:hover { background: #eaeaea; }
.month-option.active {
  background: var(--accent-color);
  color: white;
  font-weight: 600;
}
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

:root.dark .cal-title-btn:hover,
:root.dark .cal-today-btn:hover,
:root.dark .cal-nav:hover,
:root.dark .month-option:hover {
  background: #3f3f46;
}

:root.dark .month-picker {
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
}
</style>
