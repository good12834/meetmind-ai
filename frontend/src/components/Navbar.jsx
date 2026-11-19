import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Bot,
  Brain,
  Calendar,
  CheckSquare,
  Home,
  Menu,
  Mic,
  Plus,
  Users,
  X,
} from "lucide-react";

const NAV_LINKS = [
  { to: "/dashboard",    label: "Dashboard",    icon: Home },
  { to: "/meetings",     label: "Meetings",     icon: Calendar },
  { to: "/ai-chat",      label: "AI Chat",      icon: Bot },
  { to: "/action-items", label: "Action Items", icon: CheckSquare },
  { to: "/analytics",    label: "Analytics",    icon: BarChart3 },
  { to: "/team",         label: "Team",         icon: Users },
  { to: "/notifications",label: "Alerts",       icon: Bell },
];

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef   = useRef(null);

  const isAuthenticated = !!localStorage.getItem("access_token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  // close mobile menu on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // close on outside click
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isActive = (to) => location.pathname === to || (to !== "/dashboard" && location.pathname.startsWith(to));

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50" ref={menuRef}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 text-purple-400 font-bold text-lg shrink-0">
            <Brain className="w-5 h-5 text-purple-400" />
            <span className="hidden sm:inline">MeetMind AI</span>
          </Link>

          {/* Desktop nav links */}
          {isAuthenticated && (
            <div className="hidden lg:flex items-center gap-1">
              {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    isActive(to)
                      ? "bg-purple-600/20 text-purple-300 border border-purple-500/30"
                      : "text-gray-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
            {!isAuthenticated ? (
              <>
                <Link to="/login" className="text-sm text-gray-300 hover:text-white px-3 py-1.5">
                  Sign in
                </Link>
                <Link to="/register" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition">
                  Create account
                </Link>
              </>
            ) : (
              <>
                {/* New Meeting quick button */}
                <Link
                  to="/meetings"
                  className="hidden sm:flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" /> New
                </Link>

                {/* User avatar / name */}
                <div className="hidden md:flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 text-purple-300 flex items-center justify-center font-semibold text-sm">
                    {(user.name || "U").charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-300 hidden lg:inline">{user.name || "User"}</span>
                </div>

                {/* Sign out */}
                <button
                  onClick={handleLogout}
                  className="hidden sm:block bg-red-600/80 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition"
                >
                  Sign out
                </button>

                {/* Mobile hamburger */}
                <button
                  onClick={() => setOpen((v) => !v)}
                  className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition"
                  aria-label="Menu"
                >
                  {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {isAuthenticated && open && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-900 pb-3 px-4">
          <div className="flex flex-col gap-1 pt-3">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive(to)
                    ? "bg-purple-600/20 text-purple-300"
                    : "text-gray-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </Link>
            ))}
            <Link to="/meetings" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-emerald-400 hover:bg-slate-800 transition">
              <Mic className="w-4 h-4" /> Record Meeting
            </Link>
            <button onClick={handleLogout} className="text-left px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-slate-800 transition">
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
