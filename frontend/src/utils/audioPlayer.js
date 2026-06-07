/**
 * Audio player utility for TTS and pre-recorded alerts
 */

class AudioPlayer {
    constructor() {
        this.currentAudio = null;
        this.isSpeaking = false;
        this.ttsEnabled = true;
        this.audioContext = null;
        this.activeOscillators = [];
    }

    /**
     * Check if browser supports speech synthesis
     */
    supportsTTS() {
        return this.ttsEnabled && 'speechSynthesis' in window;
    }

    /**
     * Play text-to-speech message
     * @param {string} text - Text to speak
     * @param {string} lang - Language code ('en-US' or 'si-LK')
     */
    playTTS(text, lang = 'en-US') {
        if (!this.supportsTTS()) {
            console.warn('Speech synthesis not supported');
            return;
        }

        // Stop any ongoing speech
        this.stop();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9; // Slightly slower for clarity
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => {
            this.isSpeaking = true;
        };

        utterance.onend = () => {
            this.isSpeaking = false;
        };

        utterance.onerror = (event) => {
            this.isSpeaking = false;
            this.ttsEnabled = false;
            console.warn('Speech synthesis disabled after browser TTS error:', event?.error || event);
        };

        window.speechSynthesis.speak(utterance);
    }

    /**
     * Play pre-recorded audio file
     * @param {string} audioUrl - URL to audio file
     */
    playAudio(audioUrl) {
        this.stop();

        this.currentAudio = new Audio(audioUrl);
        this.currentAudio.volume = 1.0;

        this.currentAudio.onended = () => {
            this.isSpeaking = false;
        };

        this.currentAudio.onerror = (err) => {
            console.error('Audio playback error:', err);
            this.isSpeaking = false;
        };

        this.isSpeaking = true;
        this.currentAudio.play().catch(err => {
            console.error('Failed to play audio:', err);
            this.isSpeaking = false;
        });
    }

    /**
     * Play a short alarm tone using Web Audio API.
     */
    playAlarm() {
        if (typeof window === 'undefined') return;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            console.warn('Web Audio API not supported');
            return;
        }

        this.stop();

        if (!this.audioContext) {
            this.audioContext = new AudioContextCtor();
        }

        const ctx = this.audioContext;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        this.isSpeaking = true;
        const pattern = [
            { freq: 880, start: 0.0, duration: 0.18 },
            { freq: 660, start: 0.22, duration: 0.18 },
            { freq: 880, start: 0.44, duration: 0.22 },
        ];

        const base = ctx.currentTime + 0.02;
        this.activeOscillators = pattern.map(({ freq, start, duration }) => {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(freq, base + start);

            gain.gain.setValueAtTime(0.0001, base + start);
            gain.gain.exponentialRampToValueAtTime(0.18, base + start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, base + start + duration);

            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start(base + start);
            oscillator.stop(base + start + duration + 0.02);
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
            };
            return oscillator;
        });

        window.setTimeout(() => {
            this.activeOscillators = [];
            this.isSpeaking = false;
        }, 900);
    }

    /**
     * Stop any ongoing speech or audio
     */
    stop() {
        // Stop TTS
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        this.activeOscillators.forEach((oscillator) => {
            try {
                oscillator.stop();
            } catch {}
        });
        this.activeOscillators = [];

        // Stop audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }

        this.isSpeaking = false;
    }

    /**
     * Check if currently playing
     */
    isPlaying() {
        return this.isSpeaking;
    }
}

// Export singleton instance
export const audioPlayer = new AudioPlayer();
