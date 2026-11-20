import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";

const steps = [
  { n: "1", title: "Create your account", text: "It takes less than a minute." },
  { n: "2", title: "Record or start a video call", text: "Capture audio or meet face to face in the browser." },
  { n: "3", title: "Get notes automatically", text: "Transcripts, summaries and action items, generated locally." },
];

const INPUT =
  "w-full pl-11 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition";

function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const levels = [
    { label: "Too weak", bar: "bg-red-500", text: "text-red-400" },
    { label: "Weak", bar: "bg-red-500", text: "text-red-400" },
    { label: "Fair", bar: "bg-amber-500", text: "text-amber-400" },
    { label: "Good", bar: "bg-emerald-500", text: "text-emerald-400" },
    { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-400" },
  ];
  return { score, ...levels[score] };
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getStrength(form.password), [form.password]);
  const mismatch = confirm.length > 0 && confirm !== form.password;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (message) setMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (form.password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/auth/register", {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });

      // If the backend signs the user in on register, go straight to the app
      if (response.data?.access_token) {
        localStorage.setItem("access_token", response.data.access_token);
        if (response.data.user) localStorage.setItem("user", JSON.stringify(response.data.user));
        navigate("/dashboard");
      } else {
        navigate("/login", { state: { registered: true, email: form.email.trim() } });
      }
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          (error.request ? "Cannot reach the server. Please try again." : "Registration failed")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white grid lg:grid-cols-2" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1727773458292-9da4284a4d3e?q=80&w=627&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D')", backgroundSize: "cover", backgroundPosition: "center" }}>
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
              Start capturing
              <span className="text-purple-400"> every decision.</span>
            </h2>
            <p className="text-gray-400 mt-3">
              Join MeetMind AI and turn conversations into searchable notes, on your own machine.
            </p>
          </div>

          <ol className="space-y-5">
            {steps.map((s) => (
              <li key={s.n} className="flex items-start gap-4">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 font-bold text-purple-300 shrink-0">
                  {s.n}
                </span>
                <div>
                  <p className="font-semibold text-white">{s.title}</p>
                  <p className="text-sm text-gray-400">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
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
              <h1 className="text-3xl font-bold text-white">Create Account</h1>
              <p className="text-gray-400 mt-1">Get started with your MeetMind AI workspace.</p>
            </div>

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
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1.5">
                Full name
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                  👤
                </span>
                <input
                  id="name"
                  type="text"
                  name="name"
                  placeholder="Your name"
                  autoComplete="name"
                  autoFocus
                  value={form.name}
                  onChange={handleChange}
                  required
                  className={INPUT}
                />
              </div>
            </div>

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
                  value={form.email}
                  onChange={handleChange}
                  required
                  className={INPUT}
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
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  value={form.password}
                  onChange={handleChange}
                  required
                  className={`${INPUT} pr-16`}
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

              {form.password && (
                <div className="mt-2.5" aria-live="polite">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition ${
                          i <= strength.score ? strength.bar : "bg-slate-700"
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs mt-1.5 ${strength.text}`}>{strength.label}</p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-300 mb-1.5">
                Confirm password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                  🔒
                </span>
                <input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  name="confirm"
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (message) setMessage("");
                  }}
                  required
                  aria-invalid={mismatch}
                  className={`${INPUT} ${mismatch ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                />
              </div>
              {mismatch && <p className="text-xs text-red-400 mt-1.5">Passwords do not match.</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl font-semibold shadow-lg shadow-purple-600/20 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner />
                  <span>Creating account...</span>
                </>
              ) : (
                "Create Account"
              )}
            </button>

            <p className="text-gray-400 text-center text-sm">
              Already have an account?{" "}
              <Link to="/login" className="text-purple-400 hover:text-purple-300 font-medium transition">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

export default Register;
