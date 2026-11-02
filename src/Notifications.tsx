import { Link } from 'react-router-dom';
import { useAuth } from './auth';
import { useLoad } from './hooks';
import { getNotices, readNotice } from './lib/social';
import { ErrorNote } from './components';
export function Notifications(){const {userId}=useAuth();const items=useLoad(()=>userId?getNotices():Promise.resolve([]),[userId],30000);if(!userId)return null;return <section className="page narrow"><h1 className="page-title">Run updates</h1><p className="muted">Reminders and changes to runs you responded to.</p>{items.error&&<ErrorNote>{items.error}</ErrorNote>}{!items.loading&&!items.data?.length&&<p>No updates yet. RSVP Going and turn on a reminder for your next run.</p>}{items.data?.map(n=><div className={'panel notice '+(!n.read_at?'unread':'')} key={n.id}><Link to={`/run/${n.run_id}`} onClick={()=>void readNotice(n.id).then(items.reload).catch(()=>undefined)}><h2>{n.title}</h2><p>{n.body}</p></Link></div>)}</section>;}
