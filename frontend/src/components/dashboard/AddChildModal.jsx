import { useState } from 'react';
import api from '../../utils/api';

export default function AddChildModal({ onClose, onChildAdded }) {
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('3-5');
  const [preferredInteraction, setPreferredInteraction] = useState('mixed');
  const [instructionStyle, setInstructionStyle] = useState('text+icons');
  const [assistanceLevel, setAssistanceLevel] = useState('independent');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { data } = await api.post('/children', {
        name,
        ageGroup,
        preferredInteraction,
        instructionStyle,
        assistanceLevel,
      });
      onChildAdded(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add child.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Add a Child</h2>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Age Group</label>
            <select
              className="input-field"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
            >
              <option value="3-5">3-5 years</option>
              <option value="6-8">6-8 years</option>
              <option value="9-12">9-12 years</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preferred Interaction
            </label>
            <select
              className="input-field"
              value={preferredInteraction}
              onChange={(e) => setPreferredInteraction(e.target.value)}
            >
              <option value="mixed">Mixed</option>
              <option value="webcam">Webcam</option>
              <option value="mouse">Mouse</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instruction Style
            </label>
            <select
              className="input-field"
              value={instructionStyle}
              onChange={(e) => setInstructionStyle(e.target.value)}
            >
              <option value="text+icons">Text + Icons</option>
              <option value="audio+icons">Audio + Icons</option>
              <option value="icons only">Icons Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assistance Level
            </label>
            <select
              className="input-field"
              value={assistanceLevel}
              onChange={(e) => setAssistanceLevel(e.target.value)}
            >
              <option value="independent">Independent</option>
              <option value="with parent">With Parent</option>
              <option value="with therapist">With Therapist</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Child'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
