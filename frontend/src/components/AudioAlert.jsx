import { useEffect } from 'react';
import { audioPlayer } from '../utils/audioPlayer';

/**
 * AudioAlert Component
 * Handles audio feedback for alerts
 */
export default function AudioAlert({ alert, language = 'en' }) {
    useEffect(() => {
        if (!alert) return;

        // Don't play audio for ALL_CLEAR alerts
        if (alert.alert_type === 'ALL_CLEAR') return;

        if (alert.alert_type === 'PHONE_DETECTED') {
            audioPlayer.playAlarm();
            const message = language === 'si' ? alert.message_si : alert.message_en;
            const langCode = language === 'si' ? 'si-LK' : 'en-US';
            if (audioPlayer.supportsTTS()) {
                window.setTimeout(() => {
                    audioPlayer.playTTS(message, langCode);
                }, 950);
            }
            return;
        }

        // Determine which message to play
        const message = language === 'si' ? alert.message_si : alert.message_en;
        const langCode = language === 'si' ? 'si-LK' : 'en-US';

        // Play TTS
        if (audioPlayer.supportsTTS()) {
            audioPlayer.playTTS(message, langCode);
        } else {
            console.warn('TTS not supported in this browser');
        }

    }, [alert, language]);

    return null; // This component doesn't render anything
}
