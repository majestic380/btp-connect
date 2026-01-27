import { useEffect, useState, useRef } from "react";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * BTP Connect v9.4 - Application de gestion BTP
 * Frontend intégré via iframe pointant vers le backend FastAPI
 */
function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    // Vérifier que le backend est accessible
    const checkBackend = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/health`);
        if (response.ok) {
          setLoading(false);
        } else {
          setError("Backend non disponible");
        }
      } catch (e) {
        console.error("Backend check failed:", e);
        setError("Impossible de se connecter au backend");
        setLoading(false);
      }
    };
    
    checkBackend();
    
    // Auto-seed les données de démo
    const seedData = async () => {
      try {
        await fetch(`${BACKEND_URL}/api/seed`, { method: 'POST' });
        console.log("✅ Données de démo initialisées");
      } catch (e) {
        console.log("Seed déjà effectué ou erreur:", e);
      }
    };
    seedData();
  }, []);

  // Style pour l'iframe plein écran
  const iframeStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    border: 'none',
    margin: 0,
    padding: 0,
    overflow: 'hidden',
    zIndex: 999999
  };

  // Style pour le loader
  const loaderStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e1b4b 100%)',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, sans-serif'
  };

  if (error) {
    return (
      <div style={loaderStyle}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🏗️ BTP Connect</h1>
          <p style={{ color: '#f87171' }}>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={loaderStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid rgba(139, 92, 246, 0.2)',
            borderTop: '4px solid #8b5cf6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏗️ BTP Connect</h1>
          <p style={{ color: '#94a3b8' }}>Chargement de l'application...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={`${BACKEND_URL}/`}
      style={iframeStyle}
      title="BTP Connect"
      allow="fullscreen"
      onLoad={() => {
        console.log("✅ BTP Connect chargé");
      }}
    />
  );
}

export default App;
