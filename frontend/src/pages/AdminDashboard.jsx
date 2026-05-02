import { Link } from 'react-router-dom';

export default function AdminDashboard() {
    return (
        <div className="max-w-5xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
            <p className="text-sm text-gray-600 mb-4">Quick links for administrators.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link to="/analysis" className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow">
                    <h3 className="font-semibold">Exam Analysis</h3>
                    <p className="text-sm text-gray-500">View quiz marks, detections and audio transcripts</p>
                </Link>

                <Link to="/lecture-recorder" className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow">
                    <h3 className="font-semibold">Lecture Recorder</h3>
                    <p className="text-sm text-gray-500">Record or manage lecture recordings</p>
                </Link>

                <Link to="/attendance-counter" className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow">
                    <h3 className="font-semibold">Smart Attenders</h3>
                    <p className="text-sm text-gray-500">Attendance insights and controls</p>
                </Link>
            </div>
        </div>
    );
}
