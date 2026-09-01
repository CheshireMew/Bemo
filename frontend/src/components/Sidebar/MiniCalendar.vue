<template>
  <div ref="calendarRoot" class="mini-calendar">
    <div class="cal-header">
      <button type="button" class="cal-nav" aria-label="上一个月" @click="prevMonth">&lt;</button>
      <button type="button" class="cal-title-btn" :aria-expanded="showMonthPicker" aria-label="选择年月" @click="toggleMonthPicker">
        <span class="cal-title">{{ calendarTitle }}</span>
      </button>
      <div class="cal-header-actions">
        <button type="button" class="cal-today-btn" @click="goToCurrentMonth">今天</button>
        <button type="button" class="cal-nav" aria-label="下一个月" @click="nextMonth">&gt;</button>
      </div>
    </div>
    <div v-if="showMonthPicker" class="month-picker">
      <div class="month-picker-header">
        <button type="button" class="cal-nav" aria-label="上一年" @click="changePickerYear(-1)">&lt;</button>
        <span class="picker-year">{{ pickerYear }}年</span>
        <button type="button" class="cal-nav" aria-label="下一年" @click="changePickerYear(1)">&gt;</button>
      </div>
      <div class="month-grid">
        <button
          v-for="month in 12"
          :key="month"
          type="button"
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
    <div class="cal-grid" @keydown="handleCalendarKeydown">
      <template v-for="(d, i) in calendarDays" :key="d.date.toISOString()">
        <span v-if="d.otherMonth" class="cal-day-placeholder" aria-hidden="true"></span>
        <button
          v-else
          type="button"
          class="cal-day"
          :class="{
            'today': d.isToday,
            'selected': d.isSelected,
            'has-notes': d.hasNotes
          }"
          :aria-label="formatDateLabel(d.date, d.hasNotes, d.isSelected)"
          :aria-pressed="d.isSelected"
          :tabindex="i === focusedDayIndex ? 0 : -1"
          @focus="focusedDayKey = d.date.toDateString()"
          @click="handleDateSelect(d.date)"
        >{{ d.day }}</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, onMounted } from 'vue';
import { notes, selectedDate, selectDate } from '../../store/notes';

const emit = defineEmits<{
  navigate: [];
}>();

const calendarRoot = ref<HTMLElement | null>(null);
const calendarMonth = ref(new Date());
const showMonthPicker = ref(false);
const pickerYear = ref(calendarMonth.value.getFullYear());
const focusedDayKey = ref('');

const calendarTitle = computed(() => {
  const d = calendarMonth.value;
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
});

const prevMonth = () => {
  const d = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() - 1, 1);
  calendarMonth.value = d;
  pickerYear.value = d.getFullYear();
};

const nextMonth = () => {
  const d = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() + 1, 1);
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
  calendarMonth.value = new Date(date.getFullYear(), date.getMonth(), 1);
  showMonthPicker.value = false;
  emit('navigate');
};

const formatDateLabel = (date: Date, hasNotes: boolean, isSelected: boolean) => {
  const suffix = [hasNotes ? '有笔记' : '无笔记', isSelected ? '已选择' : ''].filter(Boolean).join('，');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日，${suffix}`;
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
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toDateString();
  const selectedStr = selectedDate.value?.toDateString();
  
  // 笔记日期集合
  const noteDates = new Set<string>();
  notes.value.forEach(n => {
    noteDates.add(new Date(n.created_at * 1000).toDateString());
  });
  
  const days: { day: number, date: Date, otherMonth: boolean, isToday: boolean, isSelected: boolean, hasNotes: boolean }[] = [];
  
  // 只保留本月实际占用的周；月初和月末用空格对齐星期。
  const cellCount = Math.ceil((firstDay.getDay() + daysInMonth) / 7) * 7;
  for (let i = 0; i < cellCount; i++) {
    const d = new Date(year, month, i - firstDay.getDay() + 1);
    days.push({ 
      day: d.getDate(), date: d, otherMonth: d.getMonth() !== month,
      isToday: d.toDateString() === todayStr,
      isSelected: d.toDateString() === selectedStr,
      hasNotes: noteDates.has(d.toDateString())
    });
  }
  
  return days;
});

const focusedDayIndex = computed(() => {
  const days = calendarDays.value;
  for (const test of [
    (day: typeof days[number]) => !day.otherMonth && day.date.toDateString() === focusedDayKey.value,
    (day: typeof days[number]) => !day.otherMonth && day.isSelected,
    (day: typeof days[number]) => !day.otherMonth && day.isToday,
    (day: typeof days[number]) => !day.otherMonth,
  ]) {
    const index = days.findIndex(test);
    if (index >= 0) return index;
  }
  return 0;
});
const handleCalendarKeydown = async (event: KeyboardEvent) => {
  const offset: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const amount = offset[event.key];
  if (amount === undefined) return;
  event.preventDefault();
  const date = new Date(calendarDays.value[focusedDayIndex.value]!.date);
  date.setDate(date.getDate() + amount);
  if (date.getMonth() !== calendarMonth.value.getMonth() || date.getFullYear() !== calendarMonth.value.getFullYear()) {
    calendarMonth.value = new Date(date.getFullYear(), date.getMonth(), 1);
  }
  focusedDayKey.value = date.toDateString();
  await nextTick();
  calendarRoot.value?.querySelector<HTMLButtonElement>('.cal-day[tabindex="0"]')?.focus();
};
</script>

<style scoped>
.mini-calendar { width: 100%; margin-bottom: 16px; position: relative; }
.cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cal-header-actions { display: flex; align-items: center; gap: 4px; }
.cal-title { font-size: var(--font-size-supporting); font-weight: 600; color: var(--text-primary); }
.cal-title-btn {
  background: none;
  border: none;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.cal-title-btn:hover { background: var(--accent-sidebar-bg); }
.cal-today-btn {
  background: none;
  border: none;
  color: var(--accent-color);
  font-size: var(--font-size-caption);
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}
.cal-today-btn:hover { background: var(--accent-sidebar-bg); }
.cal-nav { background: none; border: none; font-size: var(--font-size-supporting); font-weight: 500; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.cal-nav:hover { background: var(--accent-sidebar-bg); }
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
  font-size: var(--font-size-small);
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
  font-size: var(--font-size-caption);
  font-weight: 500;
  transition: all 0.15s;
}
.month-option:hover { background: var(--accent-sidebar-bg); }
.month-option.active {
  background: var(--accent-color);
  color: var(--accent-foreground, white);
  font-weight: 600;
}
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: var(--font-size-caption); font-weight: 500; color: var(--text-secondary); margin-bottom: 4px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-day-placeholder { min-width: 0; min-height: calc(1.3em + 10px); }
.cal-day { 
  text-align: center; font-size: var(--font-size-small); font-weight: 400; line-height: 1.3; padding: 5px 0;
  border-radius: 4px; cursor: pointer; color: var(--text-primary);
  transition: all 0.15s;
  border: none;
  background: transparent;
  font-family: inherit;
}
.cal-day:hover { background: var(--accent-sidebar-bg); }
.cal-day.today { font-weight: 700; color: var(--accent-color); }
.cal-day.selected { background: var(--accent-color); color: var(--accent-foreground, white); font-weight: 600; }
.cal-day.has-notes { position: relative; }
.cal-day.has-notes::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: var(--accent-color); }
.cal-day.selected.has-notes::after { background: var(--accent-foreground, white); }

:root.dark .month-picker {
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
}
</style>
