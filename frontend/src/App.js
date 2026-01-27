import { useEffect, useState } from "react";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * BTP Connect v9.4 - Application de gestion BTP
 * Redirige vers l'interface BTP Connect
 */
function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Auto-seed les données de démo
    const init = async () => {
      try {
        // Vérifier le backend
        const healthRes = await fetch(`${BACKEND_URL}/api/health`);
        if (!healthRes.ok) throw new Error("Backend non disponible");
        
        // Seed les données
        await fetch(`${BACKEND_URL}/api/seed`, { method: 'POST' });
        console.log("✅ BTP Connect initialisé");
        
        // Rediriger vers l'interface BTP Connect
        window.location.href = "/btp-connect.html";
      } catch (e) {
        console.error("Erreur initialisation:", e);
        setError(e.message);
        setLoading(false);
      }
    };
    
    init();
  }, []);

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
          <p style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
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
        <p style={{ color: '#94a3b8' }}>Initialisation de l'application...</p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
