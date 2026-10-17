import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GestureRecorder from '../components/recording/GestureRecorder';

export default function Record() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div>
      <div className="px-4 pt-4">
        <button
          className="text-sm text-gray-500 underline"
          onClick={() => navigate('/dashboard')}
        >
          ← Back to Dashboard
        </button>
      </div>
      <GestureRecorder />
    </div>
  );
}
