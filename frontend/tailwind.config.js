/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class', // Enable class-based dark mode
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // 🎯 Primary Cyan Palette
                cyan: {
                    DEFAULT: '#06B6D4',
                    50: '#ECFEFF',
                    100: '#CFFAFE',
                    200: '#A5F3FC',
                    300: '#67E8F9',
                    400: '#22D3EE',
                    500: '#06B6D4', // Primary Accent
                    600: '#0891B2', // Primary Hover
                    700: '#0E7490',
                    800: '#155E75',
                    900: '#164E63',
                },
                // Secondary Blue Gradient
                blue: {
                    light: '#22D3EE',
                    DEFAULT: '#3B82F6',
                    gradient: {
                        from: '#22D3EE',
                        to: '#3B82F6',
                    },
                },
                // Highlight & Status Colors
                highlight: '#FACC15', // Yellow for stars/ratings
                success: '#22C55E', // Green for stock high
                warning: '#F97316', // Orange for low stock
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'fade-in': 'fadeIn 0.5s ease-in-out',
                'slide-up': 'slideUp 0.4s ease-out',
                'slide-in-up': 'slideInUp 0.5s ease-out',
                'slide-in-down': 'slideInDown 0.5s ease-out',
                'scale-in': 'scaleIn 0.3s ease-out',
                'image-zoom': 'imageZoom 0.3s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(20px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                slideInUp: {
                    '0%': { transform: 'translateY(30px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                slideInDown: {
                    '0%': { transform: 'translateY(-30px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                scaleIn: {
                    '0%': { transform: 'scale(0.9)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                imageZoom: {
                    '0%': { transform: 'scale(1)' },
                    '100%': { transform: 'scale(1.1)' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
            transitionProperty: {
                'colors': 'background-color, border-color, color, fill, stroke',
            },
            transitionDuration: {
                '300': '300ms',
            },
        },
    },
    plugins: [],
}
