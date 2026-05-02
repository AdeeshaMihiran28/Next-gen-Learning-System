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

            navigate(data.user.role === 'admin' ? '/admin' : '/student');
            window.location.reload();
        } catch (ex) {
            setError(String(ex));
        }
    };

    return (
        <div className="max-w-md mx-auto p-6">
            <h1 className="text-2xl font-bold mb-4">Sign in</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="text-sm text-red-500">{error}</div>}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Username</label>
                    <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your name" className="mt-1 block w-full rounded-md border-gray-200 p-2" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className="mt-1 block w-full rounded-md border-gray-200 p-2" />
                </div>

                <div className="flex items-center gap-3">
                    <button type="submit" className="px-4 py-2 bg-cyan-600 text-white rounded-md">Sign in</button>
                    <Link to="/signup" className="text-sm text-gray-600">Create account</Link>
                </div>
            </form>
        </div>
    );
}
