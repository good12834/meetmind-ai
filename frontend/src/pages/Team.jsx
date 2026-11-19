import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  Loader2,
  Mail,
  Plus,
  ShieldAlert,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  getTeams,
  createTeam,
  getTeam,
  inviteTeamMember,
  removeTeamMember,
} from "../services/teamService";

const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member" };
const ROLE_STYLE = {
  owner: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  member: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export default function TeamPage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [openTeamId, setOpenTeamId] = useState(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (type, text) => setToast({ type, text, id: Date.now() });

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getTeams();
      setTeams(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    const name = newTeamName.trim();
    if (!name) {
      showToast("error", "Team name is required.");
      return;
    }
    setLoading(true);
    try {
      await createTeam({ name, description: newTeamDesc.trim() || undefined });
      setNewTeamName("");
      setNewTeamDesc("");
      showToast("success", "Team created.");
      loadTeams();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to create team.");
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (teamId) => {
    const email = inviteEmail.trim();
    if (!email) {
      showToast("error", "Email is required.");
      return;
    }
    setLoading(true);
    try {
      await inviteTeamMember(teamId, { email, role: inviteRole });
      setInviteEmail("");
      showToast("success", "Invite sent.");
      setOpenTeamId(openTeamId);
      loadTeams();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to invite member.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm("Remove this member from the team?")) return;
    setLoading(true);
    try {
      await removeTeamMember(memberId);
      showToast("success", "Member removed.");
      loadTeams();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to remove member.");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalMembers = teams.reduce((sum, t) => sum + (t.members || []).length, 0);
    return { teams: teams.length, members: totalMembers };
  }, [teams]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="text-2xl font-bold text-purple-400">
            MeetMind AI
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium">
            <Link to="/dashboard" className="text-gray-400 hover:text-white transition">
              Dashboard
            </Link>
            <Link to="/team" className="text-purple-400 border-b-2 border-purple-500 pb-1">
              Team Workspace
            </Link>
          </div>
        </div>
        <Link
          to="/dashboard"
          className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          Back to Dashboard
        </Link>
      </nav>

      <main className="max-w-6xl mx-auto p-6 sm:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Team Workspace</h1>
            <p className="text-gray-400 mt-1">
              Create teams, invite members, and share meetings together.
            </p>
          </div>
          <button
            onClick={() => navigate("/meetings")}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-600/20 transition inline-flex items-center gap-2"
          >
            <Users className="w-4 h-4" /> Browse Meetings
          </button>
        </div>

        {toast && (
          <div
            role="status"
            className={`fixed bottom-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border shadow-2xl bg-slate-900 ${
              toast.type === "success"
                ? "border-emerald-500/40 text-emerald-300"
                : "border-red-500/40 text-red-300"
            }`}
          >
            {toast.type === "success" ? <UserCheck className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {toast.text}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            { label: "Teams", value: stats.teams, icon: <Users className="w-5 h-5 text-purple-400" /> },
            { label: "Members", value: stats.members, icon: <User className="w-5 h-5 text-blue-400" /> },
            { label: "Shared Meetings", value: 0, icon: <Mail className="w-5 h-5 text-emerald-400" /> },
            { label: "Pending Invites", value: 0, icon: <ShieldAlert className="w-5 h-5 text-amber-400" /> },
          ].map((s) => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{s.label}</h3>
                <span>{s.icon}</span>
              </div>
              {loading ? (
                <div className="h-9 w-16 rounded-lg bg-slate-800 animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-white">{s.value}</p>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Create team */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
          <form onSubmit={handleCreateTeam} className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Create a new team</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Team name"
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500"
              />
              <input
                value={newTeamDesc}
                onChange={(e) => setNewTeamDesc(e.target.value)}
                placeholder="Description (optional)"
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
              >
                <Plus className="w-4 h-4" /> Create
              </button>
            </div>
          </form>
        </div>

        {/* Teams list */}
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center">
              <Users className="w-16 h-16 mx-auto text-gray-700 mb-3" />
              <h3 className="text-xl font-bold text-white">No teams yet</h3>
              <p className="text-gray-400 mt-1">
                Create a team above to start collaborating on meetings.
              </p>
            </div>
          ) : (
            teams.map((team) => {
              const members = team.members || [];
              const owner = members.find((m) => m.role === "owner");
              const isOpen = openTeamId === team.id;
              return (
                <div
                  key={team.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition group cursor-pointer"
                  onClick={() => setOpenTeamId(openTeamId === team.id ? null : team.id)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold">
                        {team.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <Link
                          to={`/team/${team.id}`}
                          className="font-semibold text-white hover:text-purple-400 transition"
                        >
                          {team.name}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">{team.description || "No description"}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${ROLE_STYLE.owner}`}
                    >
                      Owner
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-xs text-gray-400 mb-3">
                    <span>
                      <User className="w-3 h-3 inline" /> {members.length} member{members.length !== 1 ? "s" : ""}
                    </span>
                    <span>📅 Team created</span>
                  </div>

                  {/* Members detail (expanded) */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-white">Members</h4>
                        <span className="text-xs text-gray-500">{members.length}</span>
                      </div>
                      <div className="space-y-2">
                        {members.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-800/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-medium text-white">
                                {m.role.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-sm text-white truncate" title={m.user_id}>
                                  User {m.user_id}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ROLE_STYLE[m.role] || ROLE_STYLE.member}`}
                                >
                                  {ROLE_LABELS[m.role] || m.role}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveMember(m.id);
                              }}
                              disabled={m.role === "owner"}
                              className="text-red-400 hover:text-red-300 disabled:opacity-50 p-1.5 transition"
                              title="Remove member"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800">
                        <h4 className="text-xs font-semibold text-white mb-3">Invite member</h4>
                        <form onSubmit={(e) => handleInvite(team.id)} className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              placeholder="Email address"
                              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500"
                            />
                            <select
                              value={inviteRole}
                              onChange={(e) => setInviteRole(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-purple-500"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              type="submit"
                              disabled={loading}
                              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                            >
                              Invite
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            The person must already have a MeetMind AI account.
                          </p>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )
        }
      </div>
    </main>
  </div>
  );
}
