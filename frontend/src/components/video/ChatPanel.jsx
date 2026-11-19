import { useEffect, useRef, useState } from 'react';

export default function ChatPanel({ messages, onSend }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <aside className="vchat">
      <h3 className="vchat-title">Chat</h3>
      <div className="vchat-list">
        {messages.length === 0 && <p className="vchat-empty">No messages yet.</p>}
        {messages.map((m, i) => (
          <div key={i} className="vchat-msg">
            <strong>{m.name}</strong>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="vchat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
        />
        <button type="submit">Send</button>
      </form>
    </aside>
  );
}

