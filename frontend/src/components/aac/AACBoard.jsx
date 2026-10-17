import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { SYMBOLS, CATEGORY_COLORS } from '../../data/aacSymbols';
import SymbolCard from './SymbolCard';

const MAX_SENTENCE_LENGTH = 8;

const CATEGORY_TAB_EMOJI = {
  FEELINGS: '😊',
  FOOD: '🍎',
  ACTIONS: '🙋',
  PEOPLE: '👨',
  PLACES: '🏠',
};

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function pickSpeechLang() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return 'en-US';
  const voices = window.speechSynthesis.getVoices();
  const hasIndianEnglish = voices.some((voice) => voice.lang === 'en-IN');
  return hasIndianEnglish ? 'en-IN' : 'en-US';
}

export default function AACBoard({ child }) {
  const [activeCategory, setActiveCategory] = useState('FEELINGS');
  const [sentence, setSentence] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [symbolUsageCount, setSymbolUsageCount] = useState({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const sessionStartRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    window.speechSynthesis.getVoices();
    const handleVoicesChanged = () => {};
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
  }, []);

  function speakWord(label) {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(label);
    utterance.rate = 1.0;
    utterance.lang = pickSpeechLang();
    window.speechSynthesis.speak(utterance);
  }

  function speakSentence() {
    if (!window.speechSynthesis) return;

    if (sentence.length === 0) {
      const utterance = new SpeechSynthesisUtterance('Please select some symbols first');
      utterance.rate = 0.85;
      utterance.pitch = 1.1;
      utterance.lang = pickSpeechLang();
      window.speechSynthesis.speak(utterance);
      return;
    }

    const text = sentence.map((symbol) => symbol.label).join(' ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1.1;
    utterance.lang = pickSpeechLang();
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function handleSymbolSelect(symbol) {
    setSentence((prev) => (prev.length >= MAX_SENTENCE_LENGTH ? prev : [...prev, symbol]));
    setSymbolUsageCount((prev) => ({ ...prev, [symbol.id]: (prev[symbol.id] || 0) + 1 }));
    speakWord(symbol.label);
  }

  function removeSymbolAt(index) {
    setSentence((prev) => prev.filter((_, i) => i !== index));
  }

  function clearSentence() {
    setSentence([]);
  }

  async function saveSession() {
    setSaving(true);
    try {
      const totalAttempts = Object.values(symbolUsageCount).reduce((a, b) => a + b, 0);
      const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);

      await api.post('/sessions', {
        childId: child._id,
        module: 'aac',
        duration,
        performance: {
          accuracy: 1,
          attempts: totalAttempts,
          successRate: 1,
        },
        participationScore: {
          communicationFreq: totalAttempts,
          initiationRate: 1,
          total: Math.min(totalAttempts * 10, 100),
        },
      });

      const mergedVocabularyGraph = { ...(child.vocabularyGraph || {}) };
      Object.entries(symbolUsageCount).forEach(([symbolId, count]) => {
        mergedVocabularyGraph[symbolId] = (mergedVocabularyGraph[symbolId] || 0) + count;
      });

      await api.put(`/children/${child._id}`, { vocabularyGraph: mergedVocabularyGraph });

      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 2000);
    } catch (err) {
      console.error('Failed to save AAC session', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-primary-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="text-xl font-bold text-primary-600">MitraMove</div>
        <div className="text-gray-700 font-semibold">Hi, {child.name}! 👋</div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="bg-primary-100 rounded-2xl p-4 flex items-center gap-4 flex-wrap">
          <div className="flex-1 flex items-center gap-2 flex-wrap min-h-[48px]">
            {sentence.length === 0 && (
              <span className="text-gray-500">Tap symbols to build a sentence...</span>
            )}
            {sentence.map((symbol, idx) => (
              <span
                key={`${symbol.id}-${idx}`}
                className="flex items-center gap-1 bg-white rounded-full pl-3 pr-2 py-1.5 shadow-sm border border-gray-100"
              >
                <span className="text-xl">{symbol.emoji}</span>
                <span className="text-sm font-semibold text-gray-700">{symbol.label}</span>
                <button
                  type="button"
                  onClick={() => removeSymbolAt(idx)}
                  className="text-gray-400 hover:text-red-500 ml-1 font-bold"
                  aria-label={`Remove ${symbol.label}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={speakSentence}
              disabled={isSpeaking}
              className="btn-primary px-6 py-3 text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSpeaking ? '⏸ Speaking...' : '🔊 Speak'}
            </button>
            <button
              type="button"
              onClick={clearSentence}
              className="border-2 border-red-400 text-red-500 font-semibold px-4 py-3 rounded-xl hover:bg-red-50 transition"
            >
              🗑️ Clear
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mt-6">
          {Object.keys(SYMBOLS).map((category) => {
            const isActive = category === activeCategory;
            const color = CATEGORY_COLORS[category];
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className="flex-shrink-0 px-4 py-2 rounded-full font-semibold text-sm transition whitespace-nowrap"
                style={{
                  backgroundColor: isActive ? color : '#ffffff',
                  color: isActive ? '#ffffff' : color,
                  border: `2px solid ${color}`,
                }}
              >
                {CATEGORY_TAB_EMOJI[category]} {category}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 gap-4 mt-4">
          {SYMBOLS[activeCategory].map((symbol) => (
            <SymbolCard
              key={symbol.id}
              symbol={symbol}
              categoryColor={CATEGORY_COLORS[activeCategory]}
              onSelect={handleSymbolSelect}
              isSelected={sentence.some((s) => s.id === symbol.id)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-200">
          <Link to="/dashboard" className="text-sm text-gray-500 underline">
            ← Back to Dashboard
          </Link>
          <span className="text-sm text-gray-500">⏱ {formatTime(elapsedSeconds)}</span>
          <button
            type="button"
            onClick={saveSession}
            disabled={saving}
            className="btn-secondary disabled:opacity-60"
          >
            {saving ? 'Saving...' : '💾 Save Session'}
          </button>
        </div>
      </div>

      {showSavedToast && (
        <div className="fixed bottom-6 right-6 bg-primary-600 text-white px-5 py-3 rounded-xl shadow-lg font-semibold">
          Session saved! ✅
        </div>
      )}
    </div>
  );
}
