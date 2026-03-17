const HEATMAP_DAYS = 105;

const days = HEATMAP_DAYS;
const data = [];

const today = new Date('2026-03-15T12:00:00Z');
today.setHours(23, 59, 59, 999);

const startDate = new Date(today);
startDate.setDate(today.getDate() - days + 1);
startDate.setHours(0, 0, 0, 0);

// 周对齐填充：开始日前面填空白格子使其对齐到正确的星期几行
const startDayOfWeek = startDate.getDay(); // 0=Sun, 6=Sat
for (let i = 0; i < startDayOfWeek; i++) {
  data.push({ date: new Date(), count: 0, level: 0, empty: true });
}

for (let i = 0; i < days; i++) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);
  data.push({ date: d, count: 0, level: 0, isToday: false });
}

// 末尾填充：补齐最后一列使其有 7 个格子
const remainder = data.length % 7;
if (remainder > 0) {
  for (let i = 0; i < 7 - remainder; i++) {
    data.push({ date: new Date(), count: 0, level: 0, empty: true });
  }
}

// 标记今天
const todayStr = today.toDateString();
data.forEach(item => {
  if (!item.empty && item.date.toDateString() === todayStr) {
    item.isToday = true;
  }
});

const cols = [];
for (let i = 0; i < data.length; i += 7) {
  cols.push(data.slice(i, i + 7));
}

console.log(`Total Days: ${days}`);
console.log(`startDate: ${startDate.toDateString()}`);
console.log(`startDayOfWeek (0-6): ${startDayOfWeek}`);
console.log(`Data Length: ${data.length}`);
console.log(`Columns count: ${cols.length}`);
const lastCol = cols[cols.length - 1];
console.log(`Last Col length: ${lastCol.length}`);
console.log(`Last Col details:`);
console.log(lastCol.map(d => `${d.date.toDateString()} (empty: ${!!d.empty}, isToday: ${!!d.isToday})`));

