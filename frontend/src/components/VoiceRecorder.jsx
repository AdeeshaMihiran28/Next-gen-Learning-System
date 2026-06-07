import { useState, useEffect, useRef } from 'react';

const VoiceRecorder = () => {
    const [isListening, setIsListening] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [status, setStatus] = useState('Initializing...');
    const [lastCommand, setLastCommand] = useState('');
    const [error, setError] = useState('');
    const [uploadStatus, setUploadStatus] = useState('');
    const [browserSupported, setBrowserSupported] = useState(true);
    const [voiceCommandEnabled, setVoiceCommandEnabled] = useState(false); // Voice command mode toggle

    const videoRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const recognitionRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const isInitializingRef = useRef(false); // Prevent double initialization
    const shouldRestartRef = useRef(true); // Control auto-restart
    const lastCommandTimeRef = useRef(0); // For debouncing commands

    // Initialize camera and speech recognition
    useEffect(() => {
        // Prevent double initialization in React StrictMode
        if (isInitializingRef.current) {
            console.log('Already initializing, skipping...');
            return;
        }

        isInitializingRef.current = true;
        shouldRestartRef.current = true;
        initializeRecorder();

        return () => {
            console.log('Cleaning up voice recorder...');
            shouldRestartRef.current = false; // Stop auto-restart
            cleanup();
        };
    }, []);

    const initializeRecorder = async () => {
        try {
            console.log('Initializing recorder...');

            // Get camera and microphone access FIRST
            setStatus('🎥 Requesting camera and microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: true
            });

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            console.log('Camera and microphone access granted');
            setStatus('✅ Camera ready - Click buttons to record');

            // Now try to initialize speech recognition (optional)
            try {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    console.log('Speech recognition not supported, manual buttons still work');
                    return;
                }

                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true; // Enable interim results for faster detection
                recognition.maxAlternatives = 3; // Get multiple interpretations for better accuracy
                recognition.lang = 'en-US';

                recognition.onstart = () => {
                    console.log('Speech recognition started');
                    setIsListening(true);
                    setStatus('🎤 Listening for commands (or use buttons)');
                    setError('');
                };

                recognition.onresult = (event) => {
                    const last = event.results.length - 1;
                    const result = event.results[last];

                    // Check ALL alternatives, not just the first one
                    let bestMatch = null;
                    let bestConfidence = 0;

                    for (let i = 0; i < Math.min(result.length, 3); i++) {
                        const alternative = result[i];
                        const transcript = alternative.transcript
                            .toLowerCase()
                            .trim()
                            .replace(/[.,!?]/g, ''); // Remove punctuation

                        const confidence = alternative.confidence || 0;

                        // Check if this alternative matches our commands
                        const isStartCommand =
                            transcript === 'start' ||
                            transcript === 'star' ||  // Common misrecognition
                            transcript === 'stat' ||  // Common misrecognition
                            transcript.startsWith('start ') ||
                            transcript.endsWith(' start') ||
                            transcript.includes(' start ');

                        const isStopCommand =
                            transcript === 'stop' ||
                            transcript === 'top' ||   // Very common misrecognition
                            transcript === 'stock' || // Common misrecognition
                            transcript.startsWith('stop ') ||
                            transcript.endsWith(' stop') ||
                            transcript.includes(' stop ');

                        // If we found a matching command with better confidence, use it
                        if ((isStartCommand || isStopCommand) && confidence > bestConfidence) {
                            bestMatch = { transcript, isStartCommand, isStopCommand };
                            bestConfidence = confidence;
                        }
                    }

                    // Process the command if we found a good match
                    // Accept both final results and high-confidence interim results
                    if (bestMatch && (result.isFinal || bestConfidence > 0.7)) {
                        console.log(`🎤 Recognized (${Math.round(bestConfidence * 100)}% confident): "${bestMatch.transcript}"`);

                        if (bestMatch.isStartCommand) {
                            handleVoiceCommand('start');
                        } else if (bestMatch.isStopCommand) {
                            handleVoiceCommand('stop');
                        }
                    }
                };

                recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    // Automatically restart on common errors
                    if (event.error === 'no-speech' || event.error === 'audio-capture') {
                        console.log('No speech detected, continuing to listen...');
                        // Will auto-restart via onend
                    } else if (event.error !== 'aborted') {
                        setError(`Voice recognition: ${event.error}. Manual buttons still work.`);
                        // Clear error after 5 seconds
                        setTimeout(() => setError(''), 5000);
                    }
                };

                recognition.onend = () => {
                    console.log('Speech recognition ended');
                    setIsListening(false);

                    // Only auto-restart if flag is set (not during cleanup)
                    if (shouldRestartRef.current && recognitionRef.current && streamRef.current) {
                        console.log('Auto-restarting speech recognition...');
                        try {
                            setTimeout(() => {
                                if (shouldRestartRef.current && recognitionRef.current) {
                                    try {
                                        recognitionRef.current.start();
                                        console.log('✅ Speech recognition restarted successfully');
                                    } catch (restartError) {
                                        // If already started, just log and continue
                                        if (restartError.message && !restartError.message.includes('already started')) {
                                            console.log('Restart error:', restartError.message);
                                        }
                                    }
                                }
                            }, 300); // Increased delay to prevent conflicts
                        } catch (err) {
                            console.log('Could not restart recognition:', err);
                        }
                    } else {
                        console.log('Skipping restart (cleanup in progress)');
                    }
                };

                recognitionRef.current = recognition;

                // Don't start automatically - wait for user to enable voice mode
                console.log('Speech recognition initialized (waiting for user to enable)');
                setStatus('✅ Camera ready - Use buttons to record');

            } catch (speechError) {
                console.log('Speech recognition initialization failed:', speechError);
                setStatus('✅ Camera ready - Use buttons to record');
            }

        } catch (err) {
            console.error('Initialization error:', err);
            setError(`Failed to access camera/microphone: ${err.message}`);
            setStatus('❌ Initialization Failed');
            setBrowserSupported(false);
        }
    };

    const handleVoiceCommand = (command) => {
        // Debounce: Prevent same command within 1.5 seconds
        const now = Date.now();
        if (now - lastCommandTimeRef.current < 1500) {
            console.log('⏱️ Command ignored (cooldown period)');
            return;
        }

        console.log(`🎤 Processing command: "${command}"`);
        setLastCommand(`Processing: "${command}"`);

        // Update last command time
        lastCommandTimeRef.current = now;

        // Simple START command
        if (command === 'start') {
            if (!isRecording) {
                console.log('✅ Starting recording via voice command');
                setLastCommand('✅ Command: "Start" - Recording...');
                startRecording();
            } else {
                setLastCommand('⚠️ Already recording');
            }
        }
        // Simple STOP command
        else if (command === 'stop') {
            if (isRecording) {
                console.log('✅ Stopping recording via voice command');
                setLastCommand('✅ Command: "Stop" - Saving...');
                stopRecording();
            } else {
                setLastCommand('⚠️ Not recording');
            }
        }
    };

    const startRecording = () => {
        try {
            console.log('Start recording clicked');

            // Check if stream exists
            if (!streamRef.current) {
                setError('Camera not initialized. Please refresh the page and grant permissions.');
                return;
            }

            chunksRef.current = [];

            const mediaRecorder = new MediaRecorder(streamRef.current, {
                mimeType: 'video/webm;codecs=vp9,opus'
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                await uploadVideo(blob);
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(1000); // Collect data every second

            setIsRecording(true);
            setRecordingTime(0);
            setStatus('🔴 RECORDING');
            setError(''); // Clear any previous errors

            console.log('Recording started successfully');

            // Start timer
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('Recording start error:', err);
            setError(`Failed to start recording: ${err.message}`);
        }
    };

    const stopRecording = () => {
        console.log('Stop recording clicked');
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setStatus('💾 Saving video...');
            console.log('Recording stopped, processing video...');

            // Stop timer
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        } else {
            console.log('Cannot stop - not currently recording');
        }
    };

    const uploadVideo = async (blob) => {
        try {
            setUploadStatus('Uploading...');

            const formData = new FormData();
            formData.append('file', blob, `lecture_${Date.now()}.webm`);

            const response = await fetch('http://localhost:8000/upload-lecture', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Upload successful:', result);

            setUploadStatus(`✅ Uploaded: ${result.filename} (${result.size_mb} MB)`);
            setStatus('🎤 Listening for commands (or use buttons)');

            // Clear upload status after 5 seconds
            setTimeout(() => setUploadStatus(''), 5000);

        } catch (err) {
            console.error('Upload error:', err);
            setError(`Upload failed: ${err.message}`);
            setUploadStatus('❌ Upload failed');
            setStatus('🎤 Listening for commands (or use buttons)');
        }
    };

    const cleanup = () => {
        console.log('Stopping all streams and recognition...');
        shouldRestartRef.current = false; // Stop auto-restart immediately

        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
                recognitionRef.current = null;
                console.log('Speech recognition stopped');
            } catch (err) {
                console.log('Error stopping recognition:', err);
            }
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
                console.log('Track stopped:', track.kind);
            });
            streamRef.current = null;
        }

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        isInitializingRef.current = false; // Allow re-initialization if needed
    };

    const toggleVoiceCommandMode = () => {
        const newMode = !voiceCommandEnabled;
        setVoiceCommandEnabled(newMode);

        if (newMode) {
            // Enable voice commands - start speech recognition
            if (recognitionRef.current && streamRef.current) {
                shouldRestartRef.current = true;
                try {
                    recognitionRef.current.start();
                    console.log('🎤 Voice command mode ENABLED');
                    setStatus('🎤 Listening for voice commands...');
                    setLastCommand('Voice mode: ON - Say "start" or "stop"');
                } catch (err) {
                    console.log('Could not start recognition:', err);
                    setError('Voice recognition failed to start');
                }
            }
        } else {
            // Disable voice commands - stop speech recognition
            shouldRestartRef.current = false;
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                    console.log('🔇 Voice command mode DISABLED');
                    setStatus('✅ Camera ready - Use buttons to record');
                    setIsListening(false);
                    setLastCommand('Voice mode: OFF');
                } catch (err) {
                    console.log('Error stopping recognition:', err);
                }
            }
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-white dark:bg-gray-900 transition-colors duration-300">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-3">
                        <span className="text-4xl sm:text-5xl">🎥</span>
                        Voice-Controlled Lecture Recorder
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-3 text-base sm:text-lg">
                        Use voice commands to record lectures hands-free
                    </p>
                </div>

                {/* Browser Support Warning */}
                {!browserSupported && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl">
                        <p className="text-red-700 dark:text-red-300 font-medium">⚠️ Browser Not Supported</p>
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                            Web Speech API is not available. Please use Google Chrome or Microsoft Edge.
                        </p>
                    </div>
                )}

                {/* Status Card */}
                <div className="mb-6 p-6 bg-gray-50 dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-700/50 transition-colors duration-300">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-center sm:text-left">
                            <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Current Status</p>
                            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{status}</p>
                        </div>
                        {isRecording && (
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-2xl sm:text-3xl font-mono text-red-500 font-bold">
                                    {formatTime(recordingTime)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Voice Command Mode Toggle */}
                <div className="mb-6 flex justify-center">
                    <button
                        onClick={toggleVoiceCommandMode}
                        className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all duration-300 flex items-center gap-2 sm:gap-3 shadow-lg ${voiceCommandEnabled
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-green-500/30 hover:shadow-green-500/50 hover:scale-105'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 hover:scale-105'
                            }`}
                    >
                        <span className="text-xl sm:text-2xl">{voiceCommandEnabled ? '🎤' : '🔇'}</span>
                        <span className="whitespace-nowrap">Voice Commands: {voiceCommandEnabled ? 'ON' : 'OFF'}</span>
                        {voiceCommandEnabled && isListening && (
                            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-white rounded-full animate-pulse"></span>
                        )}
                    </button>
                </div>

                {/* Manual Control Buttons */}
                <div className="mb-6 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                    <button
                        onClick={startRecording}
                        disabled={isRecording || !browserSupported}
                        className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all flex items-center justify-center gap-2 sm:gap-3 shadow-lg ${isRecording || !browserSupported
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-600 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700 text-white shadow-green-500/20 hover:shadow-green-500/40 hover:scale-105'
                            }`}
                    >
                        <span className="text-xl sm:text-2xl">⏺️</span>
                        <span className="whitespace-nowrap">Start Recording</span>
                    </button>
                    <button
                        onClick={stopRecording}
                        disabled={!isRecording}
                        className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all flex items-center justify-center gap-2 sm:gap-3 shadow-lg ${!isRecording
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-600 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20 hover:shadow-red-500/40 hover:scale-105'
                            }`}
                    >
                        <span className="text-xl sm:text-2xl">⏹️</span>
                        <span className="whitespace-nowrap">Stop Recording</span>
                    </button>
                </div>

                {/* Camera Preview */}
                <div className="mb-6 relative">
                    <div className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700/50 bg-black shadow-xl">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-auto"
                        />
                        {isRecording && (
                            <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 px-4 py-2 rounded-full shadow-lg">
                                <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                                <span className="text-white font-bold text-sm sm:text-base">REC</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Command Feedback */}
                {lastCommand && (
                    <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/50 rounded-xl">
                        <p className="text-green-700 dark:text-green-300 font-medium text-sm">Last Command Recognized:</p>
                        <p className="text-green-900 dark:text-green-100 text-base sm:text-lg mt-1 font-semibold">{lastCommand}</p>
                    </div>
                )}

                {/* Upload Status */}
                {uploadStatus && (
                    <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl">
                        <p className="text-blue-900 dark:text-blue-100 font-medium">{uploadStatus}</p>
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl">
                        <p className="text-red-700 dark:text-red-300 font-medium">Error:</p>
                        <p className="text-red-900 dark:text-red-100 text-sm mt-1">{error}</p>
                    </div>
                )}

                {/* Instructions */}
                <div className="p-6 bg-gray-50 dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-700/50 transition-colors duration-300">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>🎛️</span>
                        <span>Controls: Voice Commands or Manual Buttons</span>
                    </h3>
                    <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl border border-cyan-200 dark:border-cyan-700/30 p-4 mb-4">
                        <p className="text-cyan-700 dark:text-cyan-300 font-semibold mb-2">🎛️ Voice Command Mode:</p>
                        <p className="text-gray-700 dark:text-gray-300 text-sm">Click the <strong>"Voice Commands: ON/OFF"</strong> button above to enable/disable microphone access for voice control.</p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-700/30">
                            <p className="text-blue-700 dark:text-blue-300 font-mono text-xl sm:text-2xl font-bold">"Start"</p>
                            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Begin capturing lecture video</p>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-700/30">
                            <p className="text-purple-700 dark:text-purple-300 font-mono text-xl sm:text-2xl font-bold">"Stop"</p>
                            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">End recording and auto-upload</p>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-700/30">
                        <p className="text-yellow-700 dark:text-yellow-300 font-medium mb-2">💡 Tips:</p>
                        <ul className="text-gray-700 dark:text-gray-300 text-sm space-y-1 list-disc list-inside">
                            <li><strong>Enable Voice Mode:</strong> Click "Voice Commands: ON" to activate microphone</li>
                            <li><strong>Manual Control:</strong> Use the buttons for reliable recording</li>
                            <li><strong>Voice Control:</strong> Just say <strong>"start"</strong> or <strong>"stop"</strong> when voice mode is ON</li>
                            <li><strong>Smart Recognition:</strong> Even "top", "star", "stat" work (homophones detected)</li>
                            <li><strong>Privacy:</strong> Voice mode OFF = microphone disabled</li>
                            <li>Videos are automatically uploaded after recording stops</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoiceRecorder;
