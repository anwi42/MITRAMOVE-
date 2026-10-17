export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 via-white to-purple-50">
      <div className="text-3xl font-bold text-primary-600 animate-pulse">MitraMove</div>
      <div className="mt-4 w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      <p className="mt-4 text-sm text-gray-500 animate-pulse">Loading...</p>
    </div>
  );
}
