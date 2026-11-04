import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { useLoad, useNow } from './hooks';
import { ErrorNote } from './components';
import {
  COURT_CHAT_MAX,
  ago,
  getCourtMessages,
  removeCourtMessage,
  reportCourtMessage,
  sendCourtMessage,
} from './lib/courtChat';
import { blockPlayer, blockWarning } from './lib/blocks';

/** Open chat for one court so players can get a run going. */
export function CourtChat({ courtId, courtName }: { courtId: string; courtName: string }) {
  const { userId } = useAuth();
  const location = useLocation();
  const now = useNow(30000);
  const messages = useLoad(
    () => (userId ? getCourtMessages(courtId) : Promise.resolve([])),
    [courtId, userId],
    5000,
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendCourtMessage(courtId, userId, body);
      setBody('');
      await messages.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setBusy(false);
    }
  }

  async function act(action: () => Promise<void>, failure: string) {
    setError(null);
    try {
      await action();
      await messages.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    }
  }

  if (!userId) {
    return (
      <section className="subsection">
        <h2>Court chat</h2>
        <p className="muted">
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> to see the chat and get a run
          going.
        </p>
      </section>
    );
  }

  const list = messages.data ?? [];

  return (
    <section className="subsection">
      <h2>Court chat</h2>
      <p className="fine">Anyone signed in can see this. Messages clear after 24 hours. Keep it respectful.</p>
      {(messages.error || error) && <ErrorNote>{error ?? messages.error}</ErrorNote>}
      {list.length > 0 && (
        <ol className="chat-list" aria-label={`${courtName} chat`}>
          {list.map((m) => {
            const mine = m.user_id === userId;
            return (
              <li key={m.id}>
                <div className="chat-heading">
                  <strong>
                    <Link to={`/player/${m.user_id}`}>{m.profiles?.display_name ?? 'Player'}</Link>
                    {mine ? ' (you)' : ''}
                  </strong>
                  <time dateTime={m.created_at}>{ago(m.created_at, now)}</time>
                </div>
                <p className="chat-body">{m.body}</p>
                {mine ? (
                  <button
                    className="link-button"
                    onClick={() => {
                      if (window.confirm('Remove this message?'))
                        void act(() => removeCourtMessage(m.id), 'Could not remove message.');
                    }}
                  >
                    Remove
                  </button>
                ) : (
                  <div className="chat-actions">
                    <button
                      className="link-button"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Report this message? It will be hidden for you, and for everyone if a few people report it.',
                          )
                        )
                          void act(() => reportCourtMessage(m.id, userId), 'Could not report message.');
                      }}
                    >
                      Report
                    </button>
                    <button
                      className="link-button"
                      onClick={() => {
                        if (window.confirm(blockWarning(m.profiles?.display_name ?? 'this player')))
                          void act(() => blockPlayer(m.user_id), 'Could not block player.');
                      }}
                    >
                      Block
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!messages.loading && list.length === 0 && (
        <p className="muted">Quiet right now. Ask who's pulling up.</p>
      )}
      <form className="form panel" onSubmit={submit}>
        <label className="field">
          <span>Message everyone at {courtName}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={COURT_CHAT_MAX}
            rows={2}
            required
            placeholder="Anybody trying to run at 6?"
          />
        </label>
        <div className="form-actions">
          <span className="fine">
            {body.length}/{COURT_CHAT_MAX}
          </span>
          <button className="btn btn-primary" disabled={busy || !body.trim()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}
