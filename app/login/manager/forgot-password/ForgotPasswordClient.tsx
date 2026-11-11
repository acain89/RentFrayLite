"use client";
import Link from "next/link";
import {useState,type FormEvent} from "react";
export default function ForgotPasswordClient(){
  const [email,setEmail]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const r=await fetch("/api/auth/forgot-password",{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",body:JSON.stringify({email})});const data=await r.json();setMessage(r.ok?data.message:"Unable to process the request. Please try again later.");}catch{setMessage("Unable to process the request. Please try again later.");}finally{setBusy(false);}}
  return <main className="rfl-auth-page"><section className="rfl-auth-card"><h1>Forgot password?</h1><p>Enter your registered management email.</p><form className="rfl-auth-form" onSubmit={submit}><label htmlFor="recovery-email">Email</label><input id="recovery-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/><button type="submit" disabled={busy}>Send reset link</button><p role="status">{message}</p></form><Link href="/login/manager">Return to sign in</Link></section></main>;
}
