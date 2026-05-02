/**
 * Audio player utility for TTS and pre-recorded alerts
 */

class AudioPlayer {
    constructor() {
        this.currentAudio = null;
        this.isSpeaking = false;
    }

    /**
     * Check if browser supports speech synthesis
     */
    supportsTTS() {
        return 'speechSynthesis' in window;
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
            console.error('Speech synthesis error:', event);
            this.isSpeaking = false;
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
     * Stop any ongoing speech or audio
     */
    stop() {
        // Stop TTS
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

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
