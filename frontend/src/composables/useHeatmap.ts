import { computed } from 'vue';
import { notes } from '../store/notes';

const HEATMAP_DAYS = 105;

export function useHeatmap() {
  const heatmapData = computed(() => {
    const days = HEATMAP_DAYS;
    const data: { date: Date, count: number, level: number, empty?: boolean, isToday?: boolean }[] = [];
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    // 周对齐填充
    const startDayOfWeek = startDate.getDay();
    for (let i = 0; i < startDayOfWeek; i++) {
      data.push({ date: new Date(), count: 0, level: 0, empty: true });
    }

    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      data.push({ date: d, count: 0, level: 0, isToday: false });
    }

    // 末尾填充
    const remainder = data.length % 7;
    if (remainder > 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        data.push({ date: new Date(), count: 0, level: 0, empty: true });
      }
    }

    notes.value.forEach(note => {
      const noteDate = new Date(note.created_at * 1000);
      noteDate.setHours(0, 0, 0, 0);
      const item = data.find(d => !d.empty && d.date.getTime() === noteDate.getTime());
      if (item) item.count++;
    });

    data.forEach(item => {
      if (!item.empty) {
        if (item.count === 0) item.level = 0;
        else if (item.count === 1) item.level = 1;
        else if (item.count === 2) item.level = 2;
        else if (item.count === 3) item.level = 3;
        else item.level = 4;
      }
    });

    const todayStr = new Date().toDateString();
    data.forEach(item => {
      if (!item.empty && item.date.toDateString() === todayStr) {
        item.isToday = true;
      }
    });

    return data;
  });

  const heatmapMonths = computed(() => {
    const seen = new Set<number>();
    const res: string[] = [];
    heatmapData.value.forEach((d: any) => {
      if (d.empty) return;
      const m = d.date.getMonth() + 1;
      if (!seen.has(m)) {
        seen.add(m);
        res.push(`${m}月`);
      } else {
        res.push(''); 
      }
    });
    return res.filter((v, i, arr) => v !== '' || (arr[i-1] !== '' && arr[i+1] !== ''));
  });

  return { heatmapData, heatmapMonths };
}
