import React, { useEffect, useRef } from 'react';

interface GameViewerProps {
  code: string;
}

export const GameViewer: React.FC<GameViewerProps> = ({ code }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        // Inject Three.js CDN if it's a 3D game (the AI might not include it)
        const threeJsScript = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>';
        doc.write(threeJsScript + code);
        doc.close();
      }
    }
  }, [code]);

  return (
    <div className="w-full h-[600px] bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl">
      <iframe
        ref={iframeRef}
        title="Game Preview"
        className="w-full h-full border-none"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
};
