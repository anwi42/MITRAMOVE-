export default function SymbolCard({ symbol, categoryColor, onSelect, isSelected = false }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(symbol)}
      className={`flex flex-col items-center justify-center w-full min-w-[100px] min-h-[110px] p-2 rounded-2xl bg-white border-[3px] shadow-sm hover:shadow-md cursor-pointer transition-all ${
        isSelected ? 'scale-105' : ''
      }`}
      style={{
        borderColor: categoryColor,
        backgroundColor: isSelected ? `${categoryColor}4D` : '#ffffff',
      }}
    >
      <span className="leading-none" style={{ fontSize: '48px' }}>
        {symbol.emoji}
      </span>
      <span
        className="mt-1 font-bold text-center"
        style={{ color: categoryColor, fontSize: '14px' }}
      >
        {symbol.label}
      </span>
    </button>
  );
}
