import { Link } from 'react-router-dom';

/**
 * QuizResults Component
 * Displays quiz results after submission
 */
export default function QuizResults({ result, onRetakeQuiz }) {
    const { score, total, percentage, autoSubmit } = result;

    // Determine grade and message
    const getGradeInfo = () => {
        if (percentage >= 90) {
            return { grade: 'A+', color: 'text-green-400', emoji: '🌟', message: 'Outstanding!' };
        } else if (percentage >= 80) {
            return { grade: 'A', color: 'text-green-300', emoji: '🎉', message: 'Excellent!' };
        } else if (percentage >= 70) {
            return { grade: 'B', color: 'text-blue-400', emoji: '👍', message: 'Good Job!' };
        } else if (percentage >= 60) {
            return { grade: 'C', color: 'text-yellow-400', emoji: '👌', message: 'Well Done!' };
        } else if (percentage >= 50) {
            return { grade: 'D', color: 'text-orange-400', emoji: '📚', message: 'Keep Practicing!' };
        } else {
            return { grade: 'F', color: 'text-red-400', emoji: '💪', message: 'Don\'t Give Up!' };
        }
    };

    const gradeInfo = getGradeInfo();

    return (
        <div className="flex flex-col items-center justify-center p-6 min-h-[calc(100vh-140px)]">
            <div className="max-w-2xl w-full">
                {/* Results Card */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/50 rounded-2xl p-8 sm:p-12 shadow-xl text-center transition-colors duration-300">
                    {/* Header */}
                    {autoSubmit && (
                        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                            <p className="text-yellow-300 text-sm">⏰ Time expired - Quiz auto-submitted</p>
                        </div>
                    )}

                    <div className="text-7xl mb-6">{gradeInfo.emoji}</div>

                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3 transition-colors duration-300">
                        Quiz Completed!
                    </h1>

                    <p className="text-gray-600 dark:text-gray-300 text-lg mb-8 transition-colors duration-300">{gradeInfo.message}</p>

                    {/* Score Display */}
                    <div className="mb-8">
                        <div className={`text-8xl font-bold mb-4 ${gradeInfo.color}`}>
                            {percentage}%
                        </div>
                        <div className="text-2xl text-gray-600 dark:text-gray-300 transition-colors duration-300">
                            {score} out of {total} correct
                        </div>
                    </div>

                    {/* Grade Badge */}
                    <div className="inline-block mb-8">
                        <div className={`px-8 py-4 rounded-2xl bg-gradient-to-r ${percentage >= 70
                                ? 'from-green-600 to-emerald-600'
                                : percentage >= 50
                                    ? 'from-yellow-600 to-orange-600'
                                    : 'from-red-600 to-pink-600'
                            }`}>
                            <div className="text-sm text-white/80 mb-1">Grade</div>
                            <div className="text-4xl font-bold text-white">{gradeInfo.grade}</div>
                        </div>
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/50 rounded-xl transition-colors duration-300">
                            <div className="text-3xl font-bold text-green-500 dark:text-green-400">{score}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Correct</div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/50 rounded-xl transition-colors duration-300">
                            <div className="text-3xl font-bold text-red-500 dark:text-red-400">{total - score}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Incorrect</div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/50 rounded-xl transition-colors duration-300">
                            <div className="text-3xl font-bold text-blue-500 dark:text-blue-400">{total}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total</div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-4">
                        <button
                            onClick={onRetakeQuiz}
                            className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white transition-all transform hover:scale-105 shadow-lg shadow-cyan-500/30"
                        >
                            Take Another Quiz
                        </button>
                        
                        <Link
                            to="/home"
                            className="flex items-center justify-center w-full py-4 rounded-xl font-bold text-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all transform hover:scale-105 shadow-md"
                        >
                            Return to Home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
