import { Link } from 'react-router-dom';

const FEATURES = [
  'AI Difficulty Adaptation',
  'Passive Calibration',
  'Flower Garden Game',
  'Communication Board',
  'Progress Reports',
  'Tremor-Robust Gestures',
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="text-xl font-bold text-primary-600">MitraMove</div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="btn-secondary">
            Sign In
          </Link>
          <Link to="/register" className="btn-primary">
            Get Started
          </Link>
        </div>
      </nav>

      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
          Every child deserves to play and communicate
        </h1>
        <p className="text-lg text-gray-500 mt-6 max-w-2xl mx-auto">
          MitraMove is an AI-powered adaptive platform that helps children with Cerebral Palsy
          play, learn, and communicate at their own pace.
        </p>

        <div className="flex items-center justify-center gap-3 mt-8">
          <Link to="/register" className="btn-primary">
            Get Started
          </Link>
          <Link to="/login" className="btn-secondary">
            Sign In
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-14">
          {FEATURES.map((feature) => (
            <span
              key={feature}
              className="bg-primary-50 text-primary-700 text-sm font-medium px-4 py-2 rounded-full"
            >
              {feature}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
