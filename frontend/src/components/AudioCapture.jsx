import { useState, useRef, useEffect } from 'react';

const EXPLICIT_CHEATING_PHRASES = [
    'tell me the answer',
    'give me the answer',
    'show me the answer',
    'what is the answer',
    'help me answer',
    'search the answer',
    'google the answer',
    'look up the answer',
    'check chatgpt',
    'ask chatgpt',
    'find the answer online',
    'answer eka denna',
];

const SEARCH_KEYWORDS = [
    'search',
    'google',
    'chatgpt',
    'bing',
    'look up',
    'lookup',
    'browser',
    'internet',
    'online',
    'website',
    'web',
];

const ANSWER_CONTEXT_KEYWORDS = [
    'answer',
    'answers',
    'solution',
    'solutions',
    'answer key',
    'solve this',
    'solve it',
    'correct answer',
    'question',
    'problem',
    'quiz',
    'exam',
];

function analyzeBrowserTranscript(transcript) {
    const lower = transcript.toLowerCase();
    const explicit = EXPLICIT_CHEATING_PHRASES.filter(phrase => lower.includes(phrase));
    const searchHits = SEARCH_KEYWORDS.filter(keyword => lower.includes(keyword));
    const contextHits = ANSWER_CONTEXT_KEYWORDS.filter(keyword => lower.includes(keyword));

    if (explicit.length > 0) {
        return {
            intent: 'CHEATING',
            score: 0.95,
            matches: explicit,
        };
    }

    if (searchHits.length > 0 && contextHits.length > 0) {
        return {
            intent: 'CHEATING',
            score: 0.9,
            matches: [...new Set([...searchHits, ...contextHits])],
        };
    }

    if (searchHits.length > 0) {
        return {
            intent: 'SUSPICIOUS',
            score: 0.55,
            matches: searchHits,
        };
    }

    return {
        intent: 'NORMAL',
        score: 0.0,
        matches: [],
    };
}

/**
 * AudioCapture
 * - Records short audio chunks (default 5s)
 * - Sends chunks to backend via WebSocket (preferred) or REST as fallback
 */
export default function AudioCapture({ isConnected, sendMessage, pushEvent }) {
    const [isRecording, setIsRecording] = useState(false);
    const [listening, setListening] = useState(false);
    const [lastTranscript, setLastTranscript] = useState('');
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunkIntervalRef = useRef(null);
    const chunksRef = useRef([]);

    const CHUNK_MS = 5_000; // 5 seconds

    useEffect(() => {
        return () => {
            stopCapture();
        };
    }, []);

    const startCapture = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mimeType = 'audio/webm;codecs=opus';
            const mr = new MediaRecorder(stream, { mimeType });

            mr.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) {
                    chunksRef.current.push(ev.data);
                }
            };

            mr.onstop = async () => {
                // noop: we handle pieces using requestData
            };

            mediaRecorderRef.current = mr;
            chunksRef.current = [];

            // Request data periodically to create chunks
            chunkIntervalRef.current = setInterval(() => {
                try {
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                        mediaRecorderRef.current.requestData();
                    }
                } catch (err) {
                    console.error('requestData error', err);
                }
            }, CHUNK_MS);

            // In-browser SpeechRecognition fallback (progressive enhancement)
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                try {
                    const recognition = new SpeechRecognition();
                    recognition.lang = 'en-US';
                    recognition.interimResults = false;
                    recognition.continuous = true;

                    recognition.onresult = (event) => {
                        let transcript = '';
                        for (let i = event.resultIndex; i < event.results.length; i++) {
                            transcript += event.results[i][0].transcript;
                        }
                        setLastTranscript(transcript);

                        const intent = analyzeBrowserTranscript(transcript);

                        const record = {
                            transcript,
                            confidence: 1.0,
                            intent,
                            method: 'browser',
                            timestamp: new Date().toISOString()
                        };
                        try {
                            const prev = JSON.parse(localStorage.getItem('audioTranscripts') || '[]');
                            prev.push(record);
                            localStorage.setItem('audioTranscripts', JSON.stringify(prev));
                        } catch (e) {
                            console.error('persist transcript failed', e);
                        }

                        // Save to backend exam session
                        if (pushEvent) {
                            pushEvent('transcript', record);
                        }
                    };

                    recognition.onerror = (e) => {
                        console.warn('SpeechRecognition error', e);
                    };

                    recognition.start();
                    // attach to mediaRecorder for cleanup
                    mediaRecorderRef.current = mediaRecorderRef.current || {};
                    mediaRecorderRef.current.recognition = recognition;
                } catch (e) {
                    console.warn('SpeechRecognition initialization failed', e);
                }
            }

            // When a chunk becomes available, send it immediately
            const onDataAvailable = async (ev) => {
                if (!ev.data || ev.data.size === 0) return;

                const blob = ev.data;
                // Convert to base64 string
                const reader = new FileReader();
                reader.onloadend = async () => {
                    try {
                        const dataUrl = reader.result;
                        const base64 = dataUrl.split(',')[1];

                        // Prefer WebSocket transport if connected
                        if (isConnected && sendMessage && sendMessage({ type: 'audio_chunk', audio: base64, mime: blob.type, timestamp: new Date().toISOString() })) {
                            return;
                        }

                        // Fallback: upload via REST
                        const fd = new FormData();
                        fd.append('file', blob, `audio_${Date.now()}.webm`);
                        try {
                            const res = await fetch('http://localhost:8000/analyze-audio', {
                                method: 'POST',
                                body: fd
                            });
                            if (res.ok) {
                                const json = await res.json();
                                setLastTranscript(json.transcript || json.error || '');
                            }
                        } catch (err) {
                            console.error('REST audio upload failed', err);
                        }
                    } catch (err) {
                        console.error('Failed to process audio chunk', err);
                    }
                };
                reader.readAsDataURL(blob);
            };

            // We attach a transient handler that will be called for each requestData
            mr.addEventListener('dataavailable', onDataAvailable);

            mr.start();
            setIsRecording(true);
            setListening(true);
        } catch (err) {
            console.error('startCapture error', err);
            setListening(false);
            stopCapture();
        }
    };

    const stopCapture = () => {
        try {
            if (chunkIntervalRef.current) {
                clearInterval(chunkIntervalRef.current);
                chunkIntervalRef.current = null;
            }

            if (mediaRecorderRef.current) {
                try {
                    // Stop SpeechRecognition if attached
                    if (mediaRecorderRef.current.recognition) {
                        try { mediaRecorderRef.current.recognition.stop(); } catch (_) {}
                        mediaRecorderRef.current.recognition = null;
                    }

                    mediaRecorderRef.current.stop();
                } catch (err) {
                    // ignore
                }
                mediaRecorderRef.current = null;
            }

            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        } catch (err) {
            console.error('stopCapture error', err);
        }

        setIsRecording(false);
        setListening(false);
    };

    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-white font-semibold">Audio Proctoring</h4>
                    <p className="text-gray-400 text-xs">Microphone monitoring (5s chunks)</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${listening ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
                    {!isRecording ? (
                        <button onClick={startCapture} className="px-3 py-1 bg-green-600 rounded-md text-sm">Start</button>
                    ) : (
                        <button onClick={stopCapture} className="px-3 py-1 bg-red-600 rounded-md text-sm">Stop</button>
                    )}
                </div>
            </div>

            {lastTranscript && (
                <div className="mt-3 text-sm text-gray-200">
                    <strong>Transcript:</strong> {lastTranscript}
                </div>
            )}
        </div>
    );
}
