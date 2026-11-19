import api from "./api";


export const getMeetingHistory = (params = {}) => {
    return api.get("/meetings/history", {
        params
    });
};

export const deleteMeeting = (meetingId) => {
    return api.delete(`/meetings/${meetingId}`);
};
