const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMondayOfWeek(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  return result;
}

export default function WeeklyCalendar({ activeDates = [], today }) {
  const todayKey = today || formatDateKey(new Date());
  const monday = getMondayOfWeek(new Date(todayKey));

  const days = DAY_LABELS.map((label, idx) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + idx);
    const dateKey = formatDateKey(date);

    return {
      label,
      dateKey,
      isActive: activeDates.includes(dateKey),
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
    };
  });

  return (
    <div className="card w-full">
      <p className="text-sm font-semibold text-gray-700 mb-3">This Week</p>
      <div className="flex justify-between">
        {days.map((day) => {
          let circleClass = 'border-2 border-gray-200 text-gray-300';
          let glyph = '';

          if (day.isActive) {
            circleClass = 'bg-primary-600 text-white';
            glyph = '✓';
          } else if (day.isFuture) {
            circleClass = 'bg-gray-100 text-gray-300';
            glyph = '•';
          } else if (day.isToday) {
            circleClass = 'border-2 border-primary-500 text-primary-600';
          }

          return (
            <div key={day.dateKey} className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${circleClass}`}
              >
                {glyph}
              </div>
              <span className="text-xs text-gray-500">{day.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
