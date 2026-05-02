import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

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
        { path: '/home', label: 'Home', icon: '??' },
        { path: '/analysis', label: 'Exam Analysis', icon: '??' }
    ];

    const studentLinks = [
        { path: '/home', label: 'Home', icon: '??' },
        { path: '/quiz', label: 'Quiz System', icon: '??' },
        { path: '/student', label: 'My Dashboard', icon: '??' }
    ];

    const isHomePage = location.pathname === '/' || location.pathname === '/home';
    const navLinks = role === 'admin'
        ? adminLinks
        : (isHomePage ? studentLinks.filter((link) => link.path === '/home') : studentLinks);

    return (
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 backdrop-blur-xl sticky top-0 z-50 shadow-sm transition-colors duration-300">
            <div className="px-4 sm:px-6 py-3">
                <div className="flex items-center justify-between">
                    <Link to="/home" className="flex items-center gap-2 hover:opacity-80 transition-opacity duration-300">
                        <div className="text-2xl sm:text-3xl">??</div>
                        <div>
                            <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white transition-colors duration-300">
                                AI Proctoring & Learning System
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 text-xs mt-0.5 transition-colors duration-300 hidden sm:block">
                                Exam Monitoring & Lecture Recording
                            </p>
                        </div>
                    </Link>

                    <nav className="flex gap-2 items-center">
                        {navLinks.map((link) => (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-1.5 sm:gap-2 hover:scale-105 ${location.pathname === link.path
                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md shadow-cyan-500/30'
                                    : 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600/50 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                <span className="text-base">{link.icon}</span>
                                <span className="hidden md:inline text-sm">{link.label}</span>
                            </Link>
                        ))}

                        <ThemeToggle />

                        {user ? (
                            <div className="flex items-center gap-2 ml-2">
                                <div className="text-sm text-gray-600 dark:text-gray-300 pr-2">{user.username} ({role})</div>
                                <button onClick={handleLogout} className="px-3 py-1 bg-red-500 text-white rounded-md text-sm">Logout</button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 ml-2">
                                <Link to="/login" className="px-3 py-1 bg-cyan-500 text-white rounded-md text-sm">Login</Link>
                                <Link to="/signup" className="px-3 py-1 bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-md text-sm">Sign up</Link>
                            </div>
                        )}
                    </nav>
                </div>
            </div>
        </header>
    );
}

export default Header;
