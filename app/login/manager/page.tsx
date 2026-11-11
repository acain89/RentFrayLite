import ManagerLoginClient from "./ManagerLoginClient";
import { passwordRecoveryReady } from "@/lib/passwordResetEmail";

export const dynamic = "force-dynamic";

export default function ManagerLoginPage() {
  return <ManagerLoginClient recoveryAvailable={passwordRecoveryReady()} />;
}
