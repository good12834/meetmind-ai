import api from "./api";

export const getTeams = async () => {
  const response = await api.get("/teams");
  return response.data;
};

export const createTeam = async (data) => {
  const response = await api.post("/teams", data);
  return response.data;
};

export const getTeam = async (teamId) => {
  const response = await api.get(`/teams/${teamId}`);
  return response.data;
};

export const inviteTeamMember = async (teamId, data) => {
  const response = await api.post(`/teams/${teamId}/invite`, data);
  return response.data;
};

export const removeTeamMember = async (memberId) => {
  const response = await api.delete(`/team-members/${memberId}`);
  return response.data;
};
