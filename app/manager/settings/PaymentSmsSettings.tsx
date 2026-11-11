"use client";
import Link from "next/link";
import {useState,type FormEvent} from "react";
import {MANAGEMENT_SMS_DISCLOSURE} from "@/lib/smsConsent";
export default function PaymentSmsSettings({initialEnabled,initialPhone,hasConsent}:{initialEnabled:boolean;initialPhone:string;hasConsent:boolean}){
  const [enabled,setEnabled]=useState(initialEnabled),[phone,setPhone]=useState(initialPhone),[consent,setConsent]=useState(false),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function save(e:FormEvent){e.preventDefault();setBusy(true);try{const response=await fetch("/api/manager/sms",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({enabled,phone,consent})});const data=await response.json();setMessage(response.ok?"SMS preference saved. STOP opt-outs remain in effect.":data.error??"Unable to save.");}catch{setMessage("Unable to save.");}finally{setBusy(false);}}
  return <section><h2>Payment SMS Notifications</h2><form onSubmit={save}>
    <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> {enabled?"ON":"OFF"}</label>
    {enabled&&<><label>Management mobile phone<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={30}/></label>
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> {MANAGEMENT_SMS_DISCLOSURE}</label>
    <p>{hasConsent?"Existing consent applies only to the previously authorized number.":"No messages are sent until you consent."} <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms</Link>.</p></>}
    <button disabled={busy} type="submit">Save SMS preference</button><p role="status">{message}</p>
  </form></section>;
}
