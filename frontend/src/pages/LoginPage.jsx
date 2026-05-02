import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { setToken } from "../utils/auth";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });

      setToken(data.token);
      nav("/home"); // go to your existing home route
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-6 border">
        <h1 className="text-2xl font-bold text-gray-900">Login</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Sign in to continue to AI Exam Proctoring System
        </p>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              className="mt-1 w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-cyan-400"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kalana@gmail.com"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Password</label>
            <input
              className="mt-1 w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-cyan-400"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            disabled={loading}
            className="w-full py-3 rounded-xl bg-cyan-500 text-white font-semibold hover:bg-cyan-600 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          Don’t have an account?{" "}
          <Link to="/register" className="text-cyan-600 font-medium hover:underline">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
