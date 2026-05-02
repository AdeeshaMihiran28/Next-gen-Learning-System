import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * WebcamStream Component — Professional AR Facial Filter Edition
 * Live webcam feed with real-time Canvas AR overlay
 */
export default function WebcamStream({ isConnected, sendMessage }) {
    const videoRef       = useRef(null);
    const displayRef     = useRef(null);   // visible canvas (AR overlay)
    const captureRef     = useRef(null);   // hidden canvas (frame sending)
    const streamRef      = useRef(null);
    const sendIntervalRef = useRef(null);
    const animRef        = useRef(null);
    const scanYRef       = useRef(0);
    const fpsCountRef    = useRef(0);
    const fpsTimerRef    = useRef(Date.now());

    const [cameraStatus, setCameraStatus] = useState('initializing');
    const [videoReady, setVideoReady]     = useState(false);
    const [error, setError]               = useState(null);
    const [fps, setFps]                   = useState(0);

    // ── AR overlay draw loop ─────────────────────────────────────────────────
    const drawOverlay = useCallback(() => {
        const video  = videoRef.current;
        const canvas = displayRef.current;
        if (!canvas || !video || !videoReady) {
            animRef.current = requestAnimationFrame(drawOverlay);
            return;
        }

        const vw = video.videoWidth  || 640;
        const vh = video.videoHeight || 480;

        // Sync canvas dimensions once
        if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width  = vw;
            canvas.height = vh;
        }

        const W = vw, H = vh;
        const ctx = canvas.getContext('2d');

        // 1. Draw video with iPhone VIVID filter
        //    saturate: vibrant punchy colours
        //    contrast: deeper blacks, brighter whites
        //    brightness: lift overall exposure slightly
        //    hue-rotate(2deg): subtle warm shift (like VIVID WARM)
        ctx.filter = 'saturate(1.85) contrast(1.18) brightness(1.06) hue-rotate(2deg)';
        ctx.drawImage(video, 0, 0, W, H);
        ctx.filter = 'none';          // reset — all AR overlay draws unfiltered

        const t    = Date.now();
        const CYAN = '#00e5ff';

        // 2. Vignette
        const vig = ctx.createRadialGradient(W/2,H/2,H*0.28, W/2,H/2,H*0.78);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.52)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);

        // 3. Dot grid
        ctx.fillStyle = 'rgba(0,229,255,0.07)';
        const gsp = 28;
        for (let x = gsp; x < W; x += gsp)
            for (let y = gsp; y < H; y += gsp)
                ctx.fillRect(x - 1, y - 1, 2, 2);

        // 4. Animated scan line
        scanYRef.current = (scanYRef.current + 1.6) % H;
        const sy   = scanYRef.current;
        const sg   = ctx.createLinearGradient(0, sy - 28, 0, sy + 28);
        sg.addColorStop(0,   'rgba(0,229,255,0)');
        sg.addColorStop(0.5, 'rgba(0,229,255,0.50)');
        sg.addColorStop(1,   'rgba(0,229,255,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, sy - 28, W, 56);

        // 5. Corner brackets
        const bL = Math.min(W, H) * 0.13;
        const pad = 14;
        ctx.strokeStyle = CYAN;
        ctx.lineWidth   = 3;
        ctx.lineCap     = 'square';
        [[pad, pad, 1, 1], [W - pad, pad, -1, 1],
         [pad, H - pad, 1, -1], [W - pad, H - pad, -1, -1]
        ].forEach(([cx, cy, dx, dy]) => {
            ctx.beginPath();
            ctx.moveTo(cx + dx * bL, cy);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx, cy + dy * bL);
            ctx.stroke();
        });

        // 6. Face oval guide
        const fW = W * 0.36, fH = H * 0.60;
        const fcx = W / 2,   fcy = H / 2 - H * 0.03;
        ctx.strokeStyle = isConnected ? 'rgba(0,229,255,0.45)' : 'rgba(239,68,68,0.5)';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.ellipse(fcx, fcy, fW / 2, fH / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 7. Crosshair
        const ch = 13;
        ctx.strokeStyle = 'rgba(0,229,255,0.45)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(fcx - ch, fcy); ctx.lineTo(fcx + ch, fcy);
        ctx.moveTo(fcx, fcy - ch); ctx.lineTo(fcx, fcy + ch);
        ctx.stroke();

        // 8. Pulsing outer border
        const pulse = 0.22 + 0.10 * Math.sin(t / 600);
        ctx.strokeStyle = isConnected
            ? `rgba(0,229,255,${pulse})` : `rgba(239,68,68,${pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W - 2, H - 2);

        // 9. HUD label top-left
        ctx.font      = 'bold 11px "Courier New", monospace';
        ctx.fillStyle = CYAN;
        ctx.shadowColor = CYAN;
        ctx.shadowBlur  = 6;
        ctx.fillText('AI·PROCTOR', pad + 2, pad + 14);
        ctx.shadowBlur = 0;

        // 10. Bottom HUD bar
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H - 26, W, 26);
        ctx.font      = '10px "Courier New", monospace';
        ctx.fillStyle = CYAN;
        ctx.fillText(isConnected ? '● LIVE' : '○ OFFLINE', pad, H - 9);
        const fpsTxt = `${fps} FPS`;
        const fTw = ctx.measureText(fpsTxt).width;
        ctx.fillText(fpsTxt, (W - fTw) / 2, H - 9);
        const now = new Date().toLocaleTimeString();
        const nTw = ctx.measureText(now).width;
        ctx.fillText(now, W - nTw - pad, H - 9);

        // FPS tracking
        fpsCountRef.current++;
        if (t - fpsTimerRef.current >= 1000) {
            setFps(fpsCountRef.current);
            fpsCountRef.current = 0;
            fpsTimerRef.current = t;
        }

        animRef.current = requestAnimationFrame(drawOverlay);
    }, [isConnected, fps, videoReady]);

    // ── Start camera ──────────────────────────────────────────────────────────
    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
                    audio: false
                });
                const video = videoRef.current;
                if (!video) return;
                video.srcObject = stream;
                streamRef.current = stream;

                // Wait for metadata + first frame
                video.onloadedmetadata = () => {
                    video.play().then(() => {
                        setCameraStatus('active');
                        setVideoReady(true);
                        setError(null);
                    }).catch(e => {
                        setCameraStatus('error');
                        setError(`Playback error: ${e.message}`);
                    });
                };
            } catch (err) {
                setCameraStatus('error');
                if (err.name === 'NotAllowedError') setError('Camera permission denied. Please allow camera access.');
                else if (err.name === 'NotFoundError') setError('No camera found. Please connect a camera.');
                else setError(`Camera error: ${err.message}`);
            }
        };
        startCamera();
        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, []);

    // ── Start AR loop when video is ready ─────────────────────────────────────
    useEffect(() => {
        if (!videoReady) return;
        if (animRef.current) cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(drawOverlay);
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, [videoReady, drawOverlay]);

    // ── Send frames to backend at 5 FPS ──────────────────────────────────────
    useEffect(() => {
        if (!isConnected || !videoReady) {
            if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
            return;
        }
        const capture = () => {
            const video  = videoRef.current;
            const canvas = captureRef.current;
            if (!video || !canvas || video.readyState < 2) return;
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            canvas.toBlob(blob => {
                if (!blob) return;
                const reader = new FileReader();
                reader.onloadend = () => sendMessage({
                    frame: reader.result.split(',')[1],
                    timestamp: new Date().toISOString()
                });
                reader.readAsDataURL(blob);
            }, 'image/jpeg', 0.8);
        };
        sendIntervalRef.current = setInterval(capture, 200);
        return () => { if (sendIntervalRef.current) clearInterval(sendIntervalRef.current); };
    }, [isConnected, videoReady, sendMessage]);

    return (
        <div className="webcam-container">
            {/* Hidden video element — source for canvas */}
            <video
                ref={videoRef}
                autoPlay playsInline muted
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />
            {/* Hidden capture canvas */}
            <canvas ref={captureRef} style={{ display: 'none' }} />

            {/* Visible AR canvas */}
            <div style={{
                position: 'relative',
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#000',
                aspectRatio: '4/3',
                boxShadow: isConnected
                    ? '0 0 0 1px rgba(0,229,255,0.35), 0 0 28px rgba(0,229,255,0.18)'
                    : '0 0 0 1px rgba(239,68,68,0.4)',
                transition: 'box-shadow 0.5s'
            }}>
                <canvas
                    ref={displayRef}
                    style={{ display: 'block', width: '100%', height: '100%' }}
                />

                {/* Initialising spinner */}
                {cameraStatus === 'initializing' && !error && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        background: '#000'
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            border: '3px solid rgba(0,229,255,0.2)',
                            borderTopColor: '#00e5ff',
                            animation: 'spin 0.9s linear infinite',
                            marginBottom: 12
                        }} />
                        <p style={{ color: '#00e5ff', fontSize: 13, fontFamily: 'monospace' }}>Initialising camera…</p>
                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    </div>
                )}

                {/* Error overlay */}
                {error && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)'
                    }}>
                        <div style={{ textAlign: 'center', padding: '24px' }}>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
                            <p style={{ color: '#f87171', fontWeight: 600, marginBottom: 4 }}>Camera Error</p>
                            <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
