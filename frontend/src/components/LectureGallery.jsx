import { useState, useEffect } from 'react';

const LectureGallery = () => {
    const [lectures, setLectures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchLectures();
        // Refresh every 10 seconds
        const interval = setInterval(fetchLectures, 10000);
        return () => clearInterval(interval);
    }, []);

    const fetchLectures = async () => {
        try {
            const response = await fetch('http://localhost:8000/lectures');
            if (!response.ok) {
                throw new Error('Failed to fetch lectures');
            }
            const data = await response.json();
            setLectures(data.lectures);
            setError('');
        } catch (err) {
            console.error('Error fetching lectures:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="p-6 bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/30">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <span>📚</span>
                    Lecture Gallery
                </h2>
                <button
                    onClick={fetchLectures}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                    <span>🔄</span>
                    Refresh
                </button>
            </div>

            {loading && (
                <div className="text-center py-12">
                    <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400 mt-4">Loading lectures...</p>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl">
                    <p className="text-red-300">Error: {error}</p>
                </div>
            )}

            {!loading && !error && lectures.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📹</div>
                    <p className="text-gray-400 text-lg">No lectures recorded yet</p>
                    <p className="text-gray-500 text-sm mt-2">
                        Start recording using voice commands above
                    </p>
                </div>
            )}

            {!loading && !error && lectures.length > 0 && (
                <div>
                    <p className="text-gray-400 mb-4">
                        Total: {lectures.length} lecture{lectures.length !== 1 ? 's' : ''}
                    </p>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {lectures.map((lecture, index) => (
                            <div
                                key={index}
                                className="p-4 bg-gray-900/50 rounded-xl border border-gray-700/50 hover:border-blue-500/50 transition-all"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="text-3xl">🎥</div>
                                    <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-full">
                                        {lecture.size_mb} MB
                                    </span>
                                </div>

                                <h3 className="text-white font-medium mb-2 truncate">
                                    {lecture.filename}
                                </h3>

                                <p className="text-gray-400 text-sm flex items-center gap-1">
                                    <span>📅</span>
                                    {formatDate(lecture.uploaded_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LectureGallery;
