import { useState, useEffect } from 'react';
import WebcamStream from './WebcamStream';
import AlertDisplay from './AlertDisplay';
import StatusMonitor from './StatusMonitor';
import AudioAlert from './AudioAlert';
import AudioCapture from './AudioCapture';
import { useWebSocket } from '../hooks/useWebSocket';

const WEBSOCKET_URL = 'ws://localhost:8000/ws/proctoring';

/**
 * ProctoringWidget Component
 * Sidebar widget that handles all proctoring features
 * Only active when isActive prop is true
 */
export default function ProctoringWidget({ isActive, language = 'en' }) {
    const { isConnected, lastMessage, error, sendMessage } = useWebSocket(
        isActive ? WEBSOCKET_URL : null // Only connect when active
    );

    const [currentAlert, setCurrentAlert] = useState(null);
    const [status, setStatus] = useState(null);
    const [phoneDetected, setPhoneDetected] = useState(false);
    const [violationHistory, setViolationHistory] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('violationHistory') || '[]');
        } catch (e) {
            return [];
        }
    });
    const [audioTranscripts, setAudioTranscripts] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('audioTranscripts') || '[]');
        } catch (e) {
            return [];
        }
    });
    const [lastTranscript, setLastTranscript] = useState('');

    // Push an event to the backend exam session
    const pushEvent = (eventType, data) => {
        const sessionId = localStorage.getItem('currentExamSessionId');
        if (!sessionId) return;
        fetch(`http://localhost:8000/exam-sessions/${sessionId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                events: [{
                    event_type: eventType,
                    timestamp: new Date().toISOString(),
                    data
                }]
            })
        }).catch(() => {});
    };

    // Handle incoming WebSocket messages
    useEffect(() => {
        if (!lastMessage) return;

        if (lastMessage.type === 'alert') {
            const alertData = lastMessage.data;
            setCurrentAlert(alertData);

            // Show phone detection overlay
            if (alertData.alert_type === 'PHONE_DETECTED') {
                setPhoneDetected(true);
                setTimeout(() => setPhoneDetected(false), 6000);
            }

            // Add to violation history if it's an actual violation
            if (alertData.severity === 'critical' || alertData.severity === 'warning') {
                setViolationHistory(prev => {
                    const next = [...prev, alertData];
                    try { localStorage.setItem('violationHistory', JSON.stringify(next)); } catch (e) {}
                    return next;
                });

                // Save to backend exam session
                const evType = alertData.alert_type === 'NO_FACE' ? 'no_face' : 'violation';
                pushEvent(evType, alertData);
            }

            // Clear alert after 5 seconds
            setTimeout(() => {
                setCurrentAlert(null);
            }, 5000);
        } else if (lastMessage.type === 'status') {
            setStatus(lastMessage.data);
        } else if (lastMessage.type === 'audio_transcript') {
            const transcript = lastMessage.data?.transcript ?? '';
            const error = lastMessage.data?.error ?? null;

            // Show transcript or error in the small widget area
            setLastTranscript(transcript || error || '');

            // Only persist and save if there's a real transcript (not just an error)
            if (transcript && !error) {
                const record = {
                    transcript,
                    error: null,
                    confidence: lastMessage.data?.confidence ?? null,
                    intent: lastMessage.data?.intent ?? null,
                    timestamp: new Date().toISOString()
                };

                setAudioTranscripts(prev => {
                    const next = [...prev, record];
                    try { localStorage.setItem('audioTranscripts', JSON.stringify(next)); } catch (e) {}
                    return next;
                });

                // Save transcript to backend exam session
                pushEvent('transcript', record);
            } else if (error) {
                // Log errors locally but don't save to exam session as transcripts
                console.warn('STT error (not saved as transcript):', error);
            }
        } else if (lastMessage.type === 'error') {
            console.error('Backend error:', lastMessage.message);
        }
    }, [lastMessage]);

    if (!isActive) {
        return (
            <div className="h-full flex items-center justify-center bg-gray-800/30 rounded-2xl border border-gray-700/50 p-8">
                <div className="text-center">
                    <div className="text-6xl mb-4">📹</div>
                    <h3 className="text-gray-400 font-medium mb-2">Proctoring Inactive</h3>
                    <p className="text-gray-500 text-sm">Start a quiz to activate monitoring</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Phone Detection Full-Screen Overlay */}
            {phoneDetected && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'fadeInOverlay 0.3s ease'
                    }}
                    onClick={() => setPhoneDetected(false)}
                >
                    <div style={{
                        background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                        borderRadius: '24px',
                        padding: '48px 56px',
                        textAlign: 'center',
                        maxWidth: '480px',
                        width: '90%',
                        boxShadow: '0 0 60px rgba(220,38,38,0.6)',
                        animation: 'scaleInAlert 0.35s cubic-bezier(0.34,1.56,0.64,1)'
                    }}>
                        <div style={{ fontSize: '72px', marginBottom: '16px' }}>📵</div>
                        <h2 style={{ color: 'white', fontSize: '28px', fontWeight: 800, marginBottom: '12px', margin: '0 0 12px' }}>
                            Mobile Phone Detected!
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', marginBottom: '8px', margin: '0 0 8px' }}>
                            ⚠️ Do NOT use mobile phones during the exam.
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '15px', marginBottom: '24px', margin: '0 0 24px' }}>
                            This violation has been recorded. Please put your phone away immediately.
                        </p>
                        <div style={{
                            background: 'rgba(255,255,255,0.15)',
                            borderRadius: '12px',
                            padding: '12px 20px',
                            fontSize: '14px',
                            color: 'rgba(255,255,255,0.8)'
                        }}>
                            ජංගම දුරකථනය ඉවත් කරන්න. මෙය වාර්තා වී ඇත.
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '20px', margin: '20px 0 0' }}>
                            Tap anywhere to dismiss
                        </p>
                    </div>
                    <style>{`
                        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes scaleInAlert { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                    `}</style>
                </div>
            )}
            {/* Proctoring Header */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    AI Proctoring Active
                </h3>
                <p className="text-gray-400 text-xs mt-1">Real-time monitoring in progress</p>
            </div>

            {/* Webcam Feed */}
            <div className="flex-shrink-0">
                <WebcamStream
                    isConnected={isConnected}
                    sendMessage={sendMessage}
                />
            </div>

            {/* Audio capture */}
            <div className="flex-shrink-0">
                <AudioCapture isConnected={isConnected} sendMessage={sendMessage} pushEvent={pushEvent} />
            </div>

            {/* Alert Display */}
            {currentAlert && (
                <div className="flex-shrink-0">
                    <AlertDisplay alert={currentAlert} />
                </div>
            )}

            {/* Status Monitor */}
            <div className="flex-1 overflow-hidden">
                <StatusMonitor
                    isConnected={isConnected}
                    status={status}
                    violationHistory={violationHistory}
                />
            </div>

            {/* Connection Error */}
            {error && (
                <div className="flex-shrink-0 bg-red-500/10 border border-red-500/30 p-3 rounded-xl">
                    <p className="text-red-300 text-xs">{error}</p>
                </div>
            )}

            {/* Audio Alert Component (invisible) */}
            <AudioAlert alert={currentAlert} language={language} />
        </div>
    );
}
