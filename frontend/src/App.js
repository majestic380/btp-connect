import { useEffect } from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * BTP Connect v9.4 - Ce composant ne sera pas affiché car index.html est BTP Connect
 */
function App() {
  useEffect(() => {
    // Auto-seed les données de démo au chargement
    const seedData = async () => {
      try {
        await fetch(`${BACKEND_URL}/api/seed`, { method: 'POST' });
        console.log("✅ Données de démo initialisées");
      } catch (e) {
        console.log("Seed déjà effectué ou backend non disponible");
      }
    };
    seedData();
  }, []);

  return null; // Le vrai contenu vient de index.html
}

export default App;
