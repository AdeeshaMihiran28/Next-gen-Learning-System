import { useState, useEffect } from 'react';

/**
 * QuizComponent
 * Displays quiz questions with timer and handles submission
 */
export default function QuizComponent({ quizData, onSubmit }) {
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeRemaining, setTimeRemaining] = useState(quizData.duration_minutes * 60); // in seconds
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Timer countdown
    useEffect(() => {
        if (timeRemaining <= 0) {
            handleSubmit(true); // Auto-submit when time expires
            return;
        }

        const timer = setInterval(() => {
            setTimeRemaining((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [timeRemaining]);

    const handleAnswerSelect = (questionId, optionIndex) => {
        setAnswers((prev) => ({
            ...prev,
            [questionId]: optionIndex
        }));
    };

    const handleNext = () => {
        if (currentQuestion < quizData.questions.length - 1) {
            setCurrentQuestion((prev) => prev + 1);
        }
    };

    const handlePrevious = () => {
        if (currentQuestion > 0) {
            setCurrentQuestion((prev) => prev - 1);
        }
    };

    const handleSubmit = async (autoSubmit = false) => {
        setIsSubmitting(true);

        // Calculate score
        let correct = 0;
        quizData.questions.forEach((q) => {
            if (answers[q.id] === q.correct_answer) {
                correct++;
            }
        });

        const result = {
            answers,
            score: correct,
            total: quizData.questions.length,
            percentage: ((correct / quizData.questions.length) * 100).toFixed(1),
            autoSubmit
        };

        onSubmit(result);
    };

    // Format time as MM:SS
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const currentQ = quizData.questions[currentQuestion];
    const progress = ((currentQuestion + 1) / quizData.questions.length) * 100;
    const selectedAnswer = answers[currentQ.id];

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors duration-300">
            {/* Header */}
            <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700/50 p-6 transition-colors duration-300">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-300">{quizData.topic}</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 transition-colors duration-300">
                            Question {currentQuestion + 1} of {quizData.questions.length}
                        </p>
                    </div>

                    {/* Timer */}
                    <div className={`text-center p-4 rounded-xl border transition-colors duration-300 ${
                        timeRemaining < 60
                            ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30'
                            : timeRemaining < 300
                                ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/30'
                                : 'bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/30'
                    }`}>
                        <div className={`text-3xl font-bold mb-1 transition-colors duration-300 ${
                            timeRemaining < 60 ? 'text-red-600 dark:text-red-400'
                            : timeRemaining < 300 ? 'text-yellow-600 dark:text-yellow-300'
                            : 'text-green-600 dark:text-green-300'
                        }`}>
                            {formatTime(timeRemaining)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">Time Remaining</div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 transition-colors duration-300">
                    <div
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Question Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900 transition-colors duration-300">
                <div className="max-w-3xl mx-auto">
                    {/* Question */}
                    <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 transition-colors duration-300">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-300">
                            {currentQ.question}
                        </h3>
                    </div>

                    {/* Options */}
                    <div className="space-y-4">
                        {currentQ.options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => handleAnswerSelect(currentQ.id, index)}
                                className={`w-full p-5 rounded-xl border-2 text-left transition-all transform hover:scale-[1.01] ${
                                    selectedAnswer === index
                                        ? 'bg-cyan-50 dark:bg-cyan-600/20 border-cyan-500 shadow-lg shadow-cyan-500/20'
                                        : 'bg-white dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 hover:border-cyan-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-colors duration-200 ${
                                        selectedAnswer === index
                                            ? 'bg-cyan-500 border-cyan-500 text-white'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                                    }`}>
                                        {String.fromCharCode(65 + index)}
                                    </div>
                                    <span className={`text-base transition-colors duration-200 ${
                                        selectedAnswer === index
                                            ? 'text-cyan-700 dark:text-white font-semibold'
                                            : 'text-gray-700 dark:text-gray-300'
                                    }`}>
                                        {option}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700/50 p-6 transition-colors duration-300">
                <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                    <button
                        onClick={handlePrevious}
                        disabled={currentQuestion === 0}
                        className={`px-6 py-3 rounded-xl font-medium transition-all ${
                            currentQuestion === 0
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                        ← Previous
                    </button>

                    <div className="text-gray-500 dark:text-gray-400 text-sm transition-colors duration-300">
                        {Object.keys(answers).length} / {quizData.questions.length} answered
                    </div>

                    {currentQuestion < quizData.questions.length - 1 ? (
                        <button
                            onClick={handleNext}
                            className="px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-md shadow-cyan-500/30 transition-all"
                        >
                            Next →
                        </button>
                    ) : (
                        <button
                            onClick={() => handleSubmit(false)}
                            disabled={isSubmitting}
                            className="px-8 py-3 rounded-xl font-bold bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-md shadow-green-500/30 transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
