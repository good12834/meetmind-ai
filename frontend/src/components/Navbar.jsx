import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const isAuthenticated = !!localStorage.getItem("access_token");

  return (
    <nav className="bg-slate-900 p-4 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold text-purple-400">
          MeetMind AI
        </Link>

        <div className="flex items-center gap-3">
          {!isAuthenticated ? (
            <>
              <Link to="/login" className="text-sm text-gray-300 hover:text-white">
                Sign in
              </Link>
              <Link to="/register" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                Create account
              </Link>
            </>
          ) : (
            <>
              <span className="text-sm text-gray-400 hidden md:inline">
                Signed in
              </span>
              <Link
                to="/record"
                className="text-sm text-gray-400 hover:text-white md:inline transition"
              >
                Record
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;