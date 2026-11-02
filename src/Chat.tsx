import { useState, type FormEvent } from 'react';
import { useAuth } from './auth';
import { useLoad } from './hooks';
import { ErrorNote } from './components';
import { getMessages, sendMessage, removeMessage } from './lib/social';
export function Chat({crewId,runId,leader=false}:{crewId:string;runId?:string;leader?:boolean}){
 const {userId}=useAuth();const messages=useLoad(()=>userId?getMessages(crewId,runId):Promise.resolve([]),[crewId,runId,userId],5000);
 const [body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function submit(e:FormEvent){e.preventDefault();if(!userId||busy)return;setBusy(true);setError(null);try{await sendMessage(crewId,userId,body,runId);setBody('');await messages.reload();}catch(e){setError(e instanceof Error?e.message:'Could not send message.');}finally{setBusy(false);}}
 if(!userId)return null;
 return <section className="subsection"><h2>{runId?'Run chat':'Crew chat'}</h2><p className="fine">Visible to current crew members. Keep it respectful. Updates every 5 seconds.</p>
 {(messages.error||error)&&<ErrorNote>{error??messages.error}</ErrorNote>}
 <ol className="chat-list" aria-label={runId?'Run messages':'Crew messages'}>{messages.data?.map(m=><li key={m.id}><div className="chat-heading"><strong>{m.profiles?.display_name??'Player'}{m.user_id===userId?' (you)':''}</strong><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div><p className="chat-body">{m.body}</p>{(leader||m.user_id===userId)&&<button className="link-button" onClick={async()=>{if(!window.confirm('Remove this message?'))return;try{await removeMessage(m.id);await messages.reload();}catch(e){setError(e instanceof Error?e.message:'Could not remove message.');}}}>Remove message</button>}</li>)}</ol>
 {!messages.loading&&!messages.data?.length&&<p className="muted">No messages yet. Start the conversation.</p>}
 <form className="form panel" onSubmit={submit}><label className="field"><span>Message your {runId?'run':'crew'}</span><textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={1000} rows={3} required placeholder="Who's bringing a ball?"/></label><div className="form-actions"><span className="fine">{body.length}/1,000</span><button className="btn btn-primary" disabled={busy||!body.trim()}>{busy?'Sending…':'Send message'}</button></div></form></section>;
}
