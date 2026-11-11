import type {Metadata} from "next";
import ResetPasswordClient from "./ResetPasswordClient";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Reset password",robots:{index:false,follow:false},referrer:"no-referrer"};
// No token-bearing server props, reads, mutations, analytics or prefetch.
export default function ResetPasswordPage(){return <ResetPasswordClient/>;}
