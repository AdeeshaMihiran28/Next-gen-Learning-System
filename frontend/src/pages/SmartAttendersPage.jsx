export default function SmartAttendersPage() {
    // Placeholder UI for smart attendance insights
    const attendees = JSON.parse(localStorage.getItem('attendanceSnapshot') || '[]');

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-4">Smart Attenders</h1>
            <p className="text-sm text-gray-600 mb-4">Live attendance snapshots and history.</p>

            {attendees.length === 0 ? (
                <p className="text-sm text-gray-500">No attendance snapshots available. Start a session to capture attendance.</p>
            ) : (
                <div className="grid gap-3">
                    {attendees.map((a, i) => (
                        <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="text-sm font-medium">Snapshot: {new Date(a.timestamp).toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Present: {a.present?.length ?? 0} — Absent: {a.absent?.length ?? 0}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
