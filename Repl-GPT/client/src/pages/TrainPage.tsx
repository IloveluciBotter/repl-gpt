import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, Brain, Zap, Clock, Award, AlertTriangle } from "lucide-react";

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

interface AutoReviewResult {
  decision: "approved" | "rejected" | "pending";
  message: string;
  scorePct: number;
  attemptDurationSec: number;
  styleCreditsEarned: number;
  intelligenceGain: number;
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
  const [startTime, setStartTime] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [autoReviewResult, setAutoReviewResult] = useState<AutoReviewResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.tracks.getAll().then((data) => {
      setTracks(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadQuestions = async (trackId: string) => {
    setLoading(true);
    setSelectedTrack(trackId);
    setAutoReviewResult(null);
    try {
      const data = await api.tracks.getQuestions(trackId);
      const shuffled = data.sort(() => Math.random() - 0.5).slice(0, 10);
      setQuestions(shuffled);
      setCurrentIndex(0);
      setScore({ correct: 0, total: 0 });
      setUserAnswers([]);
      setStartTime(Date.now());
    } catch (error) {
      console.error("Failed to load questions:", error);
    }
    setLoading(false);
  };

  const handleAnswer = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);
    setUserAnswers((prev) => [...prev, index]);

    const isCorrect = index === questions[currentIndex].correctIndex;
    if (isCorrect) {
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      onCorrectAnswer();
    } else {
      onWrongAnswer();
    }
    setScore((s) => ({ ...s, total: s.total + 1 }));
  };

  const submitTrainingAttempt = async () => {
    if (!selectedTrack || questions.length === 0) return;
    
    setSubmitting(true);
    try {
      const correctAnswers = questions.map((q) => q.correctIndex);
      const result = await api.train.submit({
        trackId: selectedTrack,
        difficulty: "medium",
        content: JSON.stringify({ answers: userAnswers }),
        answers: userAnswers,
        correctAnswers,
        startTime,
      });
      setAutoReviewResult(result.autoReview);
    } catch (error) {
      console.error("Failed to submit training attempt:", error);
    }
    setSubmitting(false);
  };

  const nextQuestion = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      await submitTrainingAttempt();
    }
  };

  const resetToTracks = () => {
    setSelectedTrack(null);
    setQuestions([]);
    setAutoReviewResult(null);
    setUserAnswers([]);
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

  if (!currentQuestion || autoReviewResult) {
    const scorePctDisplay = autoReviewResult 
      ? Math.round(autoReviewResult.scorePct * 100) 
      : (score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0);
    
    const getDecisionIcon = () => {
      if (!autoReviewResult) return <Zap className="w-16 h-16 text-yellow-400 mx-auto mb-4" />;
      switch (autoReviewResult.decision) {
        case "approved":
          return <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />;
        case "rejected":
          return <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />;
        default:
          return <Clock className="w-16 h-16 text-yellow-400 mx-auto mb-4" />;
      }
    };

    const getDecisionColor = () => {
      if (!autoReviewResult) return "text-purple-400";
      switch (autoReviewResult.decision) {
        case "approved": return "text-green-400";
        case "rejected": return "text-red-400";
        default: return "text-yellow-400";
      }
    };

    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <div className="bg-gray-800 rounded-xl p-8">
          {submitting ? (
            <>
              <div className="animate-spin w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-400">Submitting your training attempt...</p>
            </>
          ) : (
            <>
              {getDecisionIcon()}
              <h2 className="text-2xl font-bold mb-2">
                {autoReviewResult?.decision === "approved" && "Approved!"}
                {autoReviewResult?.decision === "rejected" && "Rejected"}
                {autoReviewResult?.decision === "pending" && "Pending Review"}
                {!autoReviewResult && "Session Complete!"}
              </h2>
              
              {autoReviewResult && (
                <div className={`mb-4 p-3 rounded-lg ${
                  autoReviewResult.decision === "approved" ? "bg-green-900/30" :
                  autoReviewResult.decision === "rejected" ? "bg-red-900/30" :
                  "bg-yellow-900/30"
                }`}>
                  <p className="text-sm">{autoReviewResult.message}</p>
                </div>
              )}

              <p className="text-gray-400 mb-2">
                You got {score.correct} out of {score.total} correct
              </p>
              
              <div className={`text-5xl font-bold mb-4 ${getDecisionColor()}`}>
                {scorePctDisplay}%
              </div>

              {autoReviewResult && (
                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <Clock className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <div className="text-gray-300">{autoReviewResult.attemptDurationSec}s</div>
                    <div className="text-gray-500 text-xs">Duration</div>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <Award className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                    <div className="text-gray-300">+{autoReviewResult.styleCreditsEarned}</div>
                    <div className="text-gray-500 text-xs">Style Credits</div>
                  </div>
                </div>
              )}

              {autoReviewResult?.decision === "approved" && autoReviewResult.intelligenceGain > 0 && (
                <div className="flex items-center justify-center gap-2 mb-4 text-green-400">
                  <Brain className="w-5 h-5" />
                  <span>+{autoReviewResult.intelligenceGain} Intelligence</span>
                </div>
              )}

              <button
                onClick={resetToTracks}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
              >
                Back to Tracks
              </button>
            </>
          )}
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
