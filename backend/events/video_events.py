from flask import request
from flask_socketio import emit, join_room, leave_room
from extensions import socketio

rooms = {}      # room -> {sid: name}
sid_room = {}   # sid -> room
meetings_with_video = set()  # set of meeting_ids that had video calls


def video_cleanup(sid):
    room = sid_room.pop(sid, None)
    if not room:
        return
    rooms.get(room, {}).pop(sid, None)
    if not rooms.get(room):
        rooms.pop(room, None)
    leave_room(room, sid=sid)
    emit('video:peer-left', {'id': sid}, to=room)
    # Broadcast updated room status
    count = len(rooms.get(room, {}))
    emit('video:status-update', {'room': room, 'count': count}, to=room)


@socketio.on('video:join')
def video_join(data):
    sid = request.sid
    meeting_id = str(data.get('meetingId') or '')
    room = f"video_{meeting_id}"
    name = (data.get('name') or 'Guest')[:50]

    meetings_with_video.add(meeting_id)

    peers = rooms.setdefault(room, {})
    emit('video:peers', [{'id': s, 'name': n} for s, n in peers.items()])

    peers[sid] = name
    sid_room[sid] = room
    join_room(room)
    emit('video:peer-joined', {'id': sid, 'name': name}, to=room, include_self=False)
    emit('video:status-update', {'room': room, 'count': len(peers)}, to=room)


@socketio.on('video:signal')
def video_signal(data):
    sid = request.sid
    room = sid_room.get(sid)
    if not room or data.get('to') not in rooms.get(room, {}):
        return
    emit('video:signal', {
        'from': sid,
        'name': rooms[room].get(sid, 'Guest'),
        'signal': data['signal'],
    }, to=data['to'])


@socketio.on('video:chat')
def video_chat(data):
    sid = request.sid
    room = sid_room.get(sid)
    text = (data.get('text') or '').strip()[:1000]
    if room and text:
        emit('video:chat', {
            'id': sid,
            'name': rooms[room].get(sid, 'Guest'),
            'text': text,
        }, to=room)


@socketio.on('video:leave')
def video_leave():
    video_cleanup(request.sid)


@socketio.on('disconnect')
def video_disconnect():
    # If live_events.py already defines a 'disconnect' handler,
    # delete this one and call video_cleanup(request.sid) from there instead.
    video_cleanup(request.sid)


@socketio.on('video:query-status')
def video_query_status(data):
    meeting_id = str((data or {}).get('meetingId') or '')
    room = f"video_{meeting_id}"
    count = len(rooms.get(room, {}))
    emit('video:status-result', {
        'meetingId': meeting_id,
        'active': count > 0,
        'count': count,
        'hadVideo': meeting_id in meetings_with_video,
    })


def get_video_status(meeting_id):
    """Helper to query video room status from routes or blueprints."""
    mid = str(meeting_id)
    room = f"video_{mid}"
    count = len(rooms.get(room, {}))
    return {
        'active': count > 0,
        'count': count,
        'had_video': mid in meetings_with_video,
    }

