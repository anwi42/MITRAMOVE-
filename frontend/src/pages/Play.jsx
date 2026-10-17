import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FlowerGame from '../components/game/FlowerGame';
import FishGame from '../components/game/FishGame';
import CalibrationScreen from '../components/calibration/CalibrationScreen';

export default function Play() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialChild = location.state?.child;
  const forceCalibration = !!location.state?.startCalibration;

  const [child, setChild] = useState(initialChild || null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);

  useEffect(() => {
    if (!child) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const webcamCapable =
      child.preferredInteraction === 'webcam' || child.preferredInteraction === 'mixed';
    const needsCalibration = webcamCapable && !child.calibrationProfile?.calibrated;

    setShowCalibration(forceCalibration || needsCalibration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!child) {
    return null;
  }

  if (showCalibration) {
    return (
      <CalibrationScreen
        child={child}
        onCalibrationComplete={(calibrationProfile) => {
          setChild((prev) => ({ ...prev, calibrationProfile }));
          setShowCalibration(false);
        }}
        onSkip={() => setShowCalibration(false)}
      />
    );
  }

  if (!selectedGame) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-50 px-4">
        <div className="card w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-800">Choose a Game</h1>
          <p className="text-gray-500">What should {child.name} play today?</p>

          <button className="btn-primary w-full" onClick={() => setSelectedGame('flower')}>
            🌸 Flower Game
          </button>
          <button className="btn-secondary w-full" onClick={() => setSelectedGame('fish')}>
            🐠 Fish Adventure
          </button>
        </div>
      </div>
    );
  }

  if (selectedGame === 'fish') {
    return <FishGame child={child} />;
  }

  return <FlowerGame child={child} />;
}
