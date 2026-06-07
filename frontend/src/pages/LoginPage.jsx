import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setError(err.detail || 'Login failed');
                return;
            }

            const data = await res.json();
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('userRole', data.user.role);

            navigate('/home');
            window.location.reload();
        } catch (ex) {
            setError(String(ex));
        }
    };

    return (
        <div className="min-h-[calc(100vh-160px)] bg-slate-50 dark:bg-gray-950 px-4 py-10 transition-colors duration-300">
            <form
                onSubmit={handleSubmit}
                className="mx-auto w-full max-w-xl rounded-[32px] bg-white px-6 py-8 shadow-2xl shadow-slate-200/80 ring-1 ring-slate-200 dark:bg-gray-900 dark:shadow-black/30 dark:ring-gray-800 sm:px-10"
            >
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500 text-3xl shadow-xl shadow-cyan-300/50">
                    🔐
                </div>

                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                        Welcome Back
                    </h1>
                    <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                        Sign in to the Next Gen Learning Smart Classroom - NGLSC
                    </p>
                </div>

                {error && (
                    <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                        {error}
                    </div>
                )}

                <div className="space-y-5">
                    <label className="block">
                        <span className="text-base font-semibold text-slate-800 dark:text-slate-100">Username</span>
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your username"
                            className="mt-2 block h-14 w-full rounded-xl border border-slate-200 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-gray-700 dark:bg-gray-950 dark:focus:ring-cyan-950"
                        />
                    </label>

                    <label className="block">
                        <span className="text-base font-semibold text-slate-800 dark:text-slate-100">Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="mt-2 block h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-cyan-950"
                        />
                    </label>
                </div>

                <button
                    type="submit"
                    className="mt-7 h-14 w-full rounded-xl bg-cyan-500 text-base font-extrabold text-white shadow-xl shadow-cyan-300/50 transition hover:bg-cyan-600 focus:outline-none focus:ring-4 focus:ring-cyan-100 dark:shadow-cyan-950/40 dark:focus:ring-cyan-950"
                >
                    Sign In
                </button>

                <p className="mt-7 text-center text-base text-slate-600 dark:text-slate-300">
                    Need an account?{' '}
                    <Link to="/signup" className="font-extrabold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400">
                        Create one here
                    </Link>
                </p>
            </form>
        </div>
    );
}
