import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';
import { supabase } from './lib/supabase';
import { ErrorNote, Loading } from './components';
export function ResetPasswordPage(){const {ready,userId}=useAuth();const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[show,setShow]=useState(false),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();if(password!==confirm){setError('Passwords do not match.');return;}setBusy(true);setError(null);try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;setDone(true);setPassword('');setConfirm('');}catch(e){setError(e instanceof Error?e.message:'Could not update password.');}finally{setBusy(false);}}
 if(!ready)return <Loading/>;if(done)return <section className="page narrow"><h1>Password updated</h1><Link to="/">Back to courts</Link></section>;
 if(!userId)return <section className="page narrow"><h1>Open a fresh reset link</h1><p>This reset link is expired, already used, or invalid. Request another from the sign-in page.</p><Link to="/login">Back to sign in</Link></section>;
 return <section className="page narrow"><h1 className="page-title">Choose a new password</h1><form className="form panel" onSubmit={submit}><label className="field"><span>New password</span><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" minLength={6} required/></label><label className="field"><span>Confirm password</span><input type={show?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" minLength={6} required/></label><button className="link-button" type="button" aria-pressed={show} onClick={()=>setShow(!show)}>{show?'Hide password':'Show password'}</button>{error&&<ErrorNote>{error}</ErrorNote>}<button className="btn btn-primary" disabled={busy}>{busy?'Saving…':'Save password'}</button></form></section>;
}
