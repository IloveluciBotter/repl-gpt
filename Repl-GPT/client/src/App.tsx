import { useState } from "react";

function App() {
  const [intelligenceLevel, setIntelligenceLevel] = useState(1);
  
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Train Your AI
        </h1>
        <p className="text-gray-400 mb-8">
          Answer questions to make your AI companion smarter!
        </p>
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-400 mb-2">Intelligence Level</p>
          <p className="text-5xl font-bold text-blue-400">{intelligenceLevel}</p>
        </div>
        <button 
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
          onClick={() => setIntelligenceLevel(l => l + 1)}
        >
          Start Training
        </button>
      </div>
    </div>
  );
}

export default App;
