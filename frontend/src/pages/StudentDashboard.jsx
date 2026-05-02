import { Link } from 'react-router-dom';

export default function StudentDashboard() {
    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-4">Student Dashboard</h1>
            <p className="text-sm text-gray-600 mb-4">Quick access to quizzes and learning materials.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/quiz" className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow">
                    <h3 className="font-semibold">Start Quiz</h3>
                    <p className="text-sm text-gray-500">Take available quizzes and see results</p>
                </Link>

                <Link to="/home" className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow">
                    <h3 className="font-semibold">Home</h3>
                    <p className="text-sm text-gray-500">Course materials, lectures and announcements</p>
                </Link>
            </div>
        </div>
    );
}
