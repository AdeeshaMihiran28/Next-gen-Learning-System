import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

function getInitials(name) {
    const value = String(name || 'User').trim();
    if (!value) return 'U';
    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function Header() {
    const location = useLocation();
    const [role, setRole] = useState(null);
    const [user, setUser] = useState(null);

    useEffect(() => {
        try {
            const u = JSON.parse(localStorage.getItem('user') || 'null');
            setUser(u);
            setRole(u?.role || localStorage.getItem('userRole'));
        } catch (e) {
            setUser(null);
            setRole(localStorage.getItem('userRole'));
        }
    }, [location.pathname]);

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('token');
        setUser(null);
        setRole(null);
        window.location.href = '/home';
    };

    const adminLinks = [
        { path: '/home', label: 'Home', icon: '\u{1F3E0}' },
        { path: '/analysis', label: 'Insights', icon: '\u{1F4C8}' },
        { path: '/video-cleaner', label: 'Smart Cleaner', icon: '\u{1F3AC}' }
    ];

    const studentLinks = [
        { path: '/home', label: 'Home', icon: '\u{1F3E0}' },
        { path: '/quiz', label: 'Live Quiz', icon: '\u{1F4DD}' },
        { path: '/mcq-diagrams', label: 'Practice Lab', icon: '\u{1F4CA}' },
        { path: '/voice-quiz', label: 'Voice Lab', icon: '\u{1F399}\uFE0F' },
        { path: '/student', label: 'Dashboard', icon: '\u{1F64B}' },
        { path: '/video-cleaner', label: 'Smart Cleaner', icon: '\u{1F3AC}' }
    ];

    const isHomePage = location.pathname === '/' || location.pathname === '/home';
    const navLinks = role === 'admin'
        ? adminLinks
        : (isHomePage ? studentLinks.filter((link) => link.path === '/home') : studentLinks);

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);
    const displayName = user?.full_name || user?.name || user?.username || 'User';
    const roleLabel = role === 'admin' ? 'Admin' : 'Student';
    const avatarTone = role === 'admin'
        ? 'from-violet-500 to-fuchsia-500'
        : 'from-cyan-500 to-blue-500';
    const profilePath = role === 'admin' ? '/admin' : '/student';

    return (
        <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm backdrop-blur-xl transition-colors duration-300 dark:border-gray-700 dark:bg-gray-800">
            <div className="px-4 py-3 sm:px-6">
                <div className="flex items-center justify-between">
                    <Link to="/home" className="flex items-center gap-2 transition-opacity duration-300 hover:opacity-80">
                        <div className="text-2xl sm:text-3xl">{'\u{1F393}'}</div>
                        <div>
                            <h1 className="text-base font-bold text-gray-900 transition-colors duration-300 dark:text-white sm:text-lg">
                                AI Proctoring & Learning System
                            </h1>
                            <p className="mt-0.5 hidden text-xs text-gray-600 transition-colors duration-300 dark:text-gray-400 sm:block">
                                Exam Monitoring & Lecture Recording
                            </p>
                        </div>
                    </Link>

                    <nav className="flex items-center gap-2">
                        {navLinks.map((link) => (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={`group relative flex items-center gap-2 overflow-hidden rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 sm:px-4.5 ${isActive(link.path)
                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30 ring-1 ring-cyan-300/20'
                                    : 'border border-gray-200 bg-gray-100 text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-md dark:border-gray-600/40 dark:bg-gray-700/40 dark:text-gray-300 dark:hover:bg-gray-600/60 dark:hover:text-white'
                                    }`}
                            >
                                <span className={`text-base transition-transform duration-300 ${isActive(link.path) ? '' : 'group-hover:scale-110'}`}>{link.icon}</span>
                                <span className="hidden text-sm tracking-tight md:inline">{link.label}</span>
                            </Link>
                        ))}

                        <ThemeToggle />

                        {user ? (
                            <div className="ml-2 flex items-center gap-2">
                                <Link
                                    to={profilePath}
                                    title={`${displayName} (${roleLabel})`}
                                    aria-label={`${displayName} ${roleLabel}`}
                                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 transition hover:border-cyan-300 hover:bg-white dark:border-gray-700 dark:bg-gray-900/80 dark:hover:border-cyan-700 dark:hover:bg-gray-900"
                                >
                                    <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${avatarTone} text-sm font-extrabold text-white shadow-lg`}>
                                        {getInitials(displayName)}
                                    </div>
                                </Link>
                                <button onClick={handleLogout} className="rounded-md bg-red-500 px-3 py-1 text-sm text-white">
                                    Logout
                                </button>
                            </div>
                        ) : (
                            <div className="ml-2 flex items-center gap-2">
                                <Link to="/login" className="rounded-md bg-cyan-500 px-3 py-1 text-sm text-white">Login</Link>
                                <Link to="/signup" className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-700/50 dark:text-gray-300">Sign up</Link>
                            </div>
                        )}
                    </nav>
                </div>
            </div>
        </header>
    );
}

export default Header;
