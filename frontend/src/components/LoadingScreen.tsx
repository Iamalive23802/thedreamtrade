import React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status">
      <div className="flex flex-col items-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-gray-400">Loading</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
