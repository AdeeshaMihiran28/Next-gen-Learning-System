import { useTheme } from '../context/ThemeContext';

function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="group relative p-3 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 
                     hover:border-cyan-500 dark:hover:border-cyan-400 transition-all duration-300 
                     hover:scale-110 hover:shadow-lg hover:shadow-cyan-500/20"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            <div className="relative w-6 h-6 flex items-center justify-center">
                {/* Sun Icon (Light Mode) */}
                <span
                    className={`absolute text-2xl transform transition-all duration-500 
                               ${theme === 'light'
                            ? 'rotate-0 scale-100 opacity-100'
                            : 'rotate-180 scale-0 opacity-0'}`}
                >
                    🌞
                </span>

                {/* Moon Icon (Dark Mode) */}
                <span
                    className={`absolute text-2xl transform transition-all duration-500 
                               ${theme === 'dark'
                            ? 'rotate-0 scale-100 opacity-100'
                            : '-rotate-180 scale-0 opacity-0'}`}
                >
                    🌙
                </span>
            </div>

            {/* Tooltip */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-2 py-1 
                          bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-md 
                          opacity-0 group-hover:opacity-100 transition-opacity duration-200 
                          whitespace-nowrap pointer-events-none">
                {theme === 'light' ? 'Dark' : 'Light'} Mode
            </div>
        </button>
    );
}

export default ThemeToggle;
