import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';
import { useLoad } from './hooks';
import { ErrorNote } from './components';
import { getMessages, removeMessage, reportCrewMessage, sendMessage } from './lib/social';

export function Chat({ crewId, runId, leader = false }: { crewId: string; runId?: string; leader?: boolean }) {
  const { userId } = useAuth();
  const messages = useLoad(() => userId ? getMessages(crewId, runId) : Promise.resolve([]), [crewId, runId, userId], 5000);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reported, setReported] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!userId || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(crewId, userId, body, runId);
      setBody('');
      await messages.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  async function report(messageId: string) {
    if (reporting || !window.confirm('Report this message to RunBack support? It will be hidden from your chat.')) return;
    setReporting(messageId);
    setError(null);
    setNotice('');
    try {
      await reportCrewMessage(messageId);
      setReported(ids => [...ids, messageId]);
      setNotice('Report received. The message is hidden from your chat.');
      await messages.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not report this message.');
    } finally {
      setReporting(null);
    }
  }

  async function remove(messageId: string) {
    if (!window.confirm('Remove this message?')) return;
    setError(null);
    try {
      await removeMessage(messageId);
      await messages.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove message.');
    }
  }

  if (!userId) return null;
  const visibleMessages = messages.data?.filter(message => !reported.includes(message.id)) ?? [];
  const thread = runId ? 'run' : 'crew';
  return (
    <section className="subsection">
      <h2>{runId ? 'Run chat' : 'Crew chat'}</h2>
      <p className="fine">Visible to current crew members. Keep it respectful. Updates every 5 seconds.</p>
      {(messages.error || error) && <ErrorNote>{error ?? messages.error}</ErrorNote>}
      {notice && <p className="ok" role="status">{notice}</p>}
      <ol className="chat-list" aria-label={runId ? 'Run messages' : 'Crew messages'}>
        {visibleMessages.map(message => {
          const own = message.user_id === userId;
          const name = message.profiles?.display_name ?? 'Player';
          return (
            <li key={message.id}>
              <div className="chat-heading">
                {own ? <strong>{name} (you)</strong> : <Link to={`/player/${message.user_id}`}>{name}</Link>}
                <time dateTime={message.created_at}>
                  {new Date(message.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </time>
              </div>
              <p className="chat-body">{message.body}</p>
              <div className="form-actions">
                {!own && (
                  <button className="link-button" disabled={reporting !== null} onClick={() => void report(message.id)}>
                    {reporting === message.id ? 'Reporting…' : 'Report message'}
                  </button>
                )}
                {(leader || own) && <button className="link-button" onClick={() => void remove(message.id)}>Remove message</button>}
              </div>
            </li>
          );
        })}
      </ol>
      {!messages.loading && visibleMessages.length === 0 && <p className="muted">No messages yet. Start the conversation.</p>}
      <form className="form panel" onSubmit={submit}>
        <label className="field">
          <span>Message your {thread}</span>
          <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={3} required placeholder="Who's bringing a ball?" />
        </label>
        <div className="form-actions">
          <span className="fine">{body.length}/1,000</span>
          <button className="btn btn-primary" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
        </div>
      </form>
    </section>
  );
}
