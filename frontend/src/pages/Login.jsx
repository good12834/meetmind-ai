import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";

const features = [
  { icon: "🎙️", title: "Record & transcribe", text: "Capture meetings and turn speech into timed transcripts." },
  { icon: "✨", title: "AI summaries", text: "Key points, decisions and action items, generated locally." },
  { icon: "📹", title: "Video meetings", text: "Start a call and keep everything in one place." },
];

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = Boolean(location.state?.registered);
  const [form, setForm] = useState({
    email: location.state?.email || localStorage.getItem("remembered_email") || "",
    password: "",
  });
  const [remember, setRemember] = useState(Boolean(localStorage.getItem("remembered_email")));
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (message) setMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await api.post("/auth/login", form);

      localStorage.setItem("access_token", response.data.access_token);
      localStorage.setItem("user", JSON.stringify(response.data.user));

      if (remember) localStorage.setItem("remembered_email", form.email);
      else localStorage.removeItem("remembered_email");

      navigate("/dashboard");
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          (error.request ? "Cannot reach the server. Please try again." : "Login failed")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white grid lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 border-r border-slate-800 bg-gradient-to-br from-purple-900/40 via-slate-950 to-slate-950">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-indigo-600/10 blur-3xl" />

        <Link to="/" className="relative text-2xl font-bold text-purple-400">
          MeetMind AI
        </Link>

        <div className="relative space-y-8 max-w-md">
          <div>
            <h2 className="text-4xl font-extrabold leading-tight">
              Every meeting,
              <span className="text-purple-400"> understood.</span>
            </h2>
            <p className="text-gray-400 mt-3">
              Record, transcribe and summarize your meetings with AI that runs on your own machine.
            </p>
          </div>

          <ul className="space-y-5">
            {features.map((f) => (
              <li key={f.title} className="flex items-start gap-4">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-lg shrink-0">
                  {f.icon}
                </span>
                <div>
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="text-sm text-gray-400">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-gray-500">© {new Date().getFullYear()} MeetMind AI</p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden block text-center text-2xl font-bold text-purple-400 mb-8">
            MeetMind AI
          </Link>

          <form
            onSubmit={handleSubmit}
            className="bg-slate-900 p-8 rounded-2xl space-y-5 border border-slate-800 shadow-2xl shadow-black/30"
          >
            <div>
              <h1 className="text-3xl font-bold text-white">Welcome Back</h1>
              <p className="text-gray-400 mt-1">Sign in to your MeetMind AI account.</p>
            </div>

            {justRegistered && !message && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                <span>✓</span>
                <span>Account created. Sign in to continue.</span>
              </div>
            )}

            {message && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                <span>⚠️</span>
                <span>{message}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                  ✉️
                </span>
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  value={form.email}
                  onChange={handleChange}
                  required
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                  🔒
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  className="w-full pl-11 pr-16 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 hover:text-white transition"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 accent-purple-600"
                />
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl font-semibold shadow-lg shadow-purple-600/20 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Signing in...</span>
                </>
              ) : (
                "Sign In"
              )}
            </button>

            <p className="text-gray-400 text-center text-sm">
              Don't have an account?{" "}
              <Link to="/register" className="text-purple-400 hover:text-purple-300 font-medium transition">
                Register
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

export default Login;