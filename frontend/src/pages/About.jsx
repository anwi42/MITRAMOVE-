import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-primary-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="text-xl font-bold text-primary-600">MitraMove</div>
        <Link to="/dashboard" className="text-sm text-gray-500 underline hover:text-primary-600 transition">
          ← Back to Dashboard
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">About MitraMove</h1>
          <p className="text-gray-500 mt-2">
            An AI-powered adaptive therapy platform built for children with Cerebral Palsy.
          </p>
        </div>

        <div className="card">
          <h2 className="font-bold text-gray-800 mb-2">🌸 What is MitraMove?</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            MitraMove combines gentle, game-based motor exercises with communication tools to
            support children with Cerebral Palsy. It watches how each child plays, adjusts the
            difficulty automatically, and gives parents and therapists simple, clear progress
            reports along the way.
          </p>
        </div>

        <div className="card">
          <h2 className="font-bold text-gray-800 mb-2">🌼 How the Flower Game works</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            The Flower Game is a motor-therapy exercise played with hand gestures in front of a
            webcam. Children move a flower around the screen using LEFT, RIGHT, UP, and DOWN hand
            movements, then pinch their fingers together (SELECT) to pick it. Guiding the flower
            into the glowing target zone in the center of the screen before pinching builds
            directional control and hand-eye coordination.
          </p>
        </div>

        <div className="card">
          <h2 className="font-bold text-gray-800 mb-2">💬 How the Communication Board works</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            The Communication Board is an Augmentative and Alternative Communication (AAC) tool.
            Children tap symbol cards — organized into Feelings, Food, Actions, People, and Places
            — to build a short sentence, which is then spoken aloud for them. It helps children
            who have difficulty speaking express their needs and feelings.
          </p>
        </div>

        <div className="card">
          <h2 className="font-bold text-gray-800 mb-2">🤖 How the AI adapts difficulty</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            MitraMove uses a Thompson Sampling bandit algorithm to personalize each child's
            difficulty level. After every session, it updates a confidence distribution for each
            difficulty level based on the child's score, completion, and session length, then
            samples from those distributions to recommend the next level most likely to keep the
            child engaged and successful — without being too easy or too hard.
          </p>
        </div>

        <div className="card bg-primary-50 border-primary-100">
          <h2 className="font-bold text-gray-800 mb-2">🆘 Need help?</h2>
          <p className="text-gray-600 text-sm">
            For support, contact your therapist or system administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
