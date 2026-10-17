import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import api from '../utils/api';
import AACBoard from '../components/aac/AACBoard';

export default function AAC() {
  const location = useLocation();
  const initialChild = location.state?.child;

  const [child, setChild] = useState(initialChild || null);
  const [loading, setLoading] = useState(!initialChild);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (initialChild) return undefined;

    let cancelled = false;

    async function loadChild() {
      try {
        const { data } = await api.get('/children');
        if (cancelled) return;
        if (data.length > 0) {
          setChild(data[0]);
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadChild();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!child || notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-50 px-4">
        <div className="card w-full max-w-md text-center">
          <p className="text-gray-600 mb-4">No child profile found</p>
          <Link to="/dashboard" className="btn-primary inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <AACBoard child={child} />;
}
