import type {Metadata} from "next";
import ForgotPasswordClient from "./ForgotPasswordClient";
import Link from "next/link";
import {passwordRecoveryReady,RECOVERY_UNAVAILABLE_MESSAGE} from "@/lib/passwordResetEmail";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Forgot password",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function ForgotPasswordPage(){
  if(!passwordRecoveryReady())return <main className="rfl-auth-page"><section className="rfl-auth-card"><h1>Password recovery unavailable</h1><p>{RECOVERY_UNAVAILABLE_MESSAGE}</p><Link href="/login/manager">Return to sign in</Link></section></main>;
  return <ForgotPasswordClient/>;
}
