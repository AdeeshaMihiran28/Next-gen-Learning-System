import { useState } from 'react';

/**
 * QuizConfigScreen Component
 * Home page for configuring quiz parameters
 */
export default function QuizConfigScreen({ onStartQuiz }) {
    const [topic, setTopic] = useState('Mathematics');
    const [numQuestions, setNumQuestions] = useState(5);
    const [duration, setDuration] = useState(10);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const topics = ['Mathematics', 'Science', 'History', 'General Knowledge'];

    const handleStartQuiz = async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch quiz from backend
            const response = await fetch(
                `http://localhost:8000/generate-quiz?topic=${encodeURIComponent(topic)}&count=${numQuestions}&duration=${duration}`
            );

            if (!response.ok) {
                throw new Error('Failed to generate quiz');
            }

            const quizData = await response.json();

            // Start quiz with fetched data
            onStartQuiz({
                ...quizData,
                config: { topic, numQuestions, duration }
            });
        } catch (err) {
            console.error('Quiz generation error:', err);
            setError('Failed to generate quiz. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-80px)] bg-gray-50 dark:bg-black flex items-center justify-center p-6 transition-colors duration-300">
            <div className="max-w-2xl w-full animate-fade-in">
                {/* Header */}
                <div className="text-center mb-12 animate-slide-in-down">
                    <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4 flex items-center justify-center gap-3 transition-colors duration-300">
                        <span className="text-6xl">🎓</span>
                        AI Exam Proctoring System
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300 text-lg transition-colors duration-300">Configure your quiz to begin the monitored exam</p>
                </div>

                {/* Configuration Form */}
                <div className="bg-white dark:bg-gray-900 backdrop-blur-xl border-2 border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-2xl hover:shadow-cyan-500/10 hover:border-cyan-500/30 transition-all duration-300 hover:scale-[1.02] animate-slide-in-up">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2 transition-colors duration-300">
                        <span>📝</span>
                        Quiz Configuration
                    </h2>

                    {/* Topic Selection */}
                    <div className="mb-6">
                        <label className="block text-gray-700 dark:text-gray-300 font-medium mb-3 transition-colors duration-300">
                            Lesson/Topic
                        </label>
                        <select
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-300"
                        >
                            {topics.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    {/* Number of Questions */}
                    <div className="mb-6">
                        <label className="block text-gray-700 dark:text-gray-300 font-medium mb-3 transition-colors duration-300">
                            Number of Questions
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={numQuestions}
                            onChange={(e) => setNumQuestions(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-300"
                        />
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 transition-colors duration-300">Choose between 1-50 questions</p>
                    </div>

                    {/* Duration */}
                    <div className="mb-8">
                        <label className="block text-gray-700 dark:text-gray-300 font-medium mb-3 transition-colors duration-300">
                            Time Duration (minutes)
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="180"
                            value={duration}
                            onChange={(e) => setDuration(Math.max(1, Math.min(180, parseInt(e.target.value) || 1)))}
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-300"
                        />
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 transition-colors duration-300">Maximum 180 minutes (3 hours)</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border-2 border-red-300 dark:border-red-500/30 rounded-xl animate-slide-in-down">
                            <p className="text-red-600 dark:text-red-300 text-sm transition-colors duration-300">{error}</p>
                        </div>
                    )}

                    {/* Start Button */}
                    <button
                        onClick={handleStartQuiz}
                        disabled={loading}
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 transform ${loading
                            ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 hover:scale-105 shadow-lg hover:shadow-2xl hover:shadow-cyan-500/50'
                            } text-white`}
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="animate-spin">⏳</span>
                                Generating Quiz...
                            </span>
                        ) : (
                            <span className="flex items-center justify-center gap-2">
                                <span>🚀</span>
                                Start Quiz
                            </span>
                        )}
                    </button>

                    {/* Info Box */}
                    <div className="mt-6 p-4 bg-cyan-50 dark:bg-cyan-500/10 border-2 border-cyan-300 dark:border-cyan-500/30 rounded-xl transition-colors duration-300">
                        <h3 className="text-cyan-700 dark:text-cyan-300 font-semibold mb-2 flex items-center gap-2 transition-colors duration-300">
                            <span>ℹ️</span>
                            Important Notice
                        </h3>
                        <ul className="text-cyan-600 dark:text-cyan-200 text-sm space-y-1 transition-colors duration-300">
                            <li>• AI proctoring will activate once you start the quiz</li>
                            <li>• Your webcam will monitor for suspicious behavior</li>
                            <li>• Ensure good lighting and stable internet connection</li>
                            <li>• The quiz will auto-submit when time expires</li>
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-8 text-gray-500 dark:text-gray-400 text-sm transition-colors duration-300">
                    <p>Powered by MediaPipe Face Mesh • FastAPI • React</p>
                </div>
            </div>
        </div>
    );
}
