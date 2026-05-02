/**
 * StatusMonitor Component
 * Displays real-time monitoring status and statistics
 */
export default function StatusMonitor({ isConnected, status, violationHistory = [] }) {
    return (
        <div className="status-monitor p-6 bg-gray-800/50 border border-gray-700/50 rounded-2xl backdrop-blur-xl">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📊</span>
                Monitoring Status
            </h2>

            {/* Connection Status */}
            <div className="mb-4 p-4 bg-gray-900/50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Connection</span>
                    <span className={`font-semibold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                        {isConnected ? '● Connected' : '○ Disconnected'}
                    </span>
                </div>
            </div>

            {/* Face Detection Status */}
            {status && (
                <div className="space-y-3">
                    <div className="p-4 bg-gray-900/50 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Face Detection</span>
                            <span className={`font-semibold ${status.face_detected ? 'text-green-400' : 'text-red-400'}`}>
                                {status.face_detected ? '✓ Detected' : '✗ Not Detected'}
                            </span>
                        </div>
                    </div>

                    {/* Head Pose */}
                    {status.head_pose && (
                        <div className="p-4 bg-gray-900/50 rounded-xl">
                            <h3 className="text-gray-400 text-sm mb-3">Head Pose</h3>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="text-center">
                                    <div className="text-xs text-gray-500 mb-1">Yaw</div>
                                    <div className={`text-lg font-bold ${Math.abs(status.head_pose.yaw) > 30 ? 'text-red-400' : 'text-green-400'
                                        }`}>
                                        {status.head_pose.yaw}°
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-gray-500 mb-1">Pitch</div>
                                    <div className="text-lg font-bold text-gray-300">
                                        {status.head_pose.pitch}°
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-gray-500 mb-1">Roll</div>
                                    <div className="text-lg font-bold text-gray-300">
                                        {status.head_pose.roll}°
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Mouth Status */}
                    {status.mouth_status && (
                        <div className="p-4 bg-gray-900/50 rounded-xl">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-sm">Mouth Status</span>
                                <span className={`font-semibold ${status.mouth_status === 'open' ? 'text-yellow-400' : 'text-green-400'
                                    }`}>
                                    {status.mouth_status === 'open' ? '👄 Open' : '🤐 Closed'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* System Status */}
                    <div className="p-4 bg-gray-900/50 rounded-xl">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-sm">System Status</span>
                            <span className="font-semibold text-blue-400 capitalize">
                                {status.status.replace(/_/g, ' ')}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Violation History */}
            {violationHistory.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-400 mb-3">Recent Violations</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {violationHistory.slice(-5).reverse().map((violation, index) => {
                            const isPhone = violation.alert_type === 'PHONE_DETECTED';
                            return (
                                <div key={index} className={`p-3 border rounded-lg ${
                                    isPhone
                                        ? 'bg-orange-500/10 border-orange-500/30'
                                        : 'bg-red-500/10 border-red-500/20'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm font-medium flex items-center gap-1.5 ${
                                            isPhone ? 'text-orange-300' : 'text-red-300'
                                        }`}>
                                            {isPhone ? '📵' : '🚨'}
                                            {violation.alert_type.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {new Date(violation.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
