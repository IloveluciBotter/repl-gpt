import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, Brain, Zap } from "lucide-react";

interface TrainPageProps {
  intelligenceLevel: number;
  onCorrectAnswer: () => void;
  onWrongAnswer: () => void;
}

interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  complexity: number;
}

interface Track {
  id: string;
  name: string;
  description: string | null;
}

export function TrainPage({
  intelligenceLevel,
  onCorrectAnswer,
  onWrongAnswer,
}: TrainPageProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tracks.getAll().then((data) => {
      setTracks(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadQuestions = async (trackId: string) => {
    setLoading(true);
    setSelectedTrack(trackId);
    try {
      const data = await api.tracks.getQuestions(trackId);
      const shuffled = data.sort(() => Math.random() - 0.5).slice(0, 10);
      setQuestions(shuffled);
      setCurrentIndex(0);
      setScore({ correct: 0, total: 0 });
    } catch (error) {
      console.error("Failed to load questions:", error);
    }
    setLoading(false);
  };

  const handleAnswer = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);

    const isCorrect = index === questions[currentIndex].correctIndex;
    if (isCorrect) {
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      onCorrectAnswer();
    } else {
      onWrongAnswer();
    }
    setScore((s) => ({ ...s, total: s.total + 1 }));
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setSelectedTrack(null);
      setQuestions([]);
    }
  };

  const currentQuestion = questions[currentIndex];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!selectedTrack) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-purple-900/30 px-4 py-2 rounded-full mb-4">
            <Brain className="w-5 h-5 text-purple-400" />
            <span className="text-purple-400 font-medium">
              AI Level: {intelligenceLevel}
            </span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Train Your AI</h1>
          <p className="text-gray-400">
            Answer questions to make HiveMind smarter!
          </p>
        </div>

        {tracks.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p>No training tracks available yet.</p>
            <p className="text-sm mt-2">Check back later or ask an admin to add tracks.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {tracks.map((track) => (
              <button
                key={track.id}
                onClick={() => loadQuestions(track.id)}
                className="bg-gray-800 hover:bg-gray-700 rounded-xl p-6 text-left transition-colors border border-gray-700 hover:border-purple-500"
              >
                <h3 className="text-xl font-semibold mb-2">{track.name}</h3>
                <p className="text-gray-400 text-sm">
                  {track.description || "Train the AI in this topic"}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <div className="bg-gray-800 rounded-xl p-8">
          <Zap className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Session Complete!</h2>
          <p className="text-gray-400 mb-4">
            You got {score.correct} out of {score.total} correct
          </p>
          <div className="text-5xl font-bold text-purple-400 mb-6">
            {Math.round((score.correct / score.total) * 100)}%
          </div>
          <button
            onClick={() => setSelectedTrack(null)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
          >
            Back to Tracks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-gray-400">
          Question {currentIndex + 1} of {questions.length}
        </span>
        <span className="text-sm text-gray-400">
          Score: {score.correct}/{score.total}
        </span>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 mb-6">
        <p className="text-lg font-medium">{currentQuestion.text}</p>
      </div>

      <div className="space-y-3">
        {currentQuestion.options.map((option, index) => {
          const isSelected = selectedAnswer === index;
          const isCorrect = index === currentQuestion.correctIndex;
          let buttonClass = "bg-gray-800 hover:bg-gray-700 border-gray-700";

          if (showResult) {
            if (isCorrect) {
              buttonClass = "bg-green-900/50 border-green-500";
            } else if (isSelected && !isCorrect) {
              buttonClass = "bg-red-900/50 border-red-500";
            }
          } else if (isSelected) {
            buttonClass = "bg-purple-900/50 border-purple-500";
          }

          return (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={showResult}
              className={`w-full p-4 rounded-lg text-left transition-colors border ${buttonClass} flex items-center justify-between`}
            >
              <span>{option}</span>
              {showResult && isCorrect && (
                <CheckCircle className="w-5 h-5 text-green-400" />
              )}
              {showResult && isSelected && !isCorrect && (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
            </button>
          );
        })}
      </div>

      {showResult && (
        <button
          onClick={nextQuestion}
          className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
        >
          {currentIndex < questions.length - 1 ? "Next Question" : "Finish"}
        </button>
      )}
    </div>
  );
}
