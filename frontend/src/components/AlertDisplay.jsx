import { useEffect, useState } from 'react';

/**
 * AlertDisplay Component
 * Displays visual alerts with animations.
 */
export default function AlertDisplay({ alert }) {
    const [visible, setVisible] = useState(false);
    const [currentAlert, setCurrentAlert] = useState(null);

    useEffect(() => {
        if (alert) {
            setCurrentAlert(alert);
            setVisible(true);
        } else {
            setVisible(false);
        }
    }, [alert]);

    if (!currentAlert) return null;

    const getAlertStyle = () => {
        if (currentAlert.alert_type === 'PHONE_DETECTED') {
            return {
                bg: 'bg-orange-500/10 border-orange-500/50',
                text: 'text-orange-300',
                icon: 'PHONE',
                glow: 'shadow-orange-500/20',
            };
        }

        switch (currentAlert.severity) {
            case 'critical':
                return {
                    bg: 'bg-red-500/10 border-red-500/30',
                    text: 'text-red-300',
                    icon: 'ALERT',
                    glow: 'shadow-red-500/20',
                };
            case 'warning':
                return {
                    bg: 'bg-yellow-500/10 border-yellow-500/30',
                    text: 'text-yellow-300',
                    icon: 'WARN',
                    glow: 'shadow-yellow-500/20',
                };
            case 'info':
                return {
                    bg: 'bg-green-500/10 border-green-500/30',
                    text: 'text-green-300',
                    icon: 'INFO',
                    glow: 'shadow-green-500/20',
                };
            default:
                return {
                    bg: 'bg-blue-500/10 border-blue-500/30',
                    text: 'text-blue-300',
                    icon: 'NOTE',
                    glow: 'shadow-blue-500/20',
                };
        }
    };

    const style = getAlertStyle();

    return (
        <div className={`alert-container ${visible ? 'alert-enter' : 'alert-exit'}`}>
            <div
                className={`
                    p-6 rounded-2xl border backdrop-blur-xl
                    ${style.bg} ${style.glow}
                    shadow-2xl
                    transform transition-all duration-300
                `}
            >
                <div className="flex items-start gap-4">
                    <div className="text-sm font-bold tracking-[0.2em]">{style.icon}</div>

                    <div className="flex-1">
                        <h3 className={`text-lg font-bold mb-2 ${style.text}`}>
                            {currentAlert.alert_type.replace(/_/g, ' ')}
                        </h3>

                        <p className={`text-sm mb-1 ${style.text}`}>
                            {currentAlert.message_en}
                        </p>

                        {currentAlert.message_si ? (
                            <p className={`text-sm opacity-80 ${style.text}`}>
                                {currentAlert.message_si}
                            </p>
                        ) : null}

                        {currentAlert.timestamp ? (
                            <p className="text-xs opacity-60 mt-3 text-gray-400">
                                {new Date(currentAlert.timestamp).toLocaleTimeString()}
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>

            <style>{`
                .alert-container {
                    transition: all 0.3s ease-in-out;
                }

                .alert-enter {
                    opacity: 1;
                    transform: translateY(0);
                }

                .alert-exit {
                    opacity: 0;
                    transform: translateY(-20px);
                }
            `}</style>
        </div>
    );
}
