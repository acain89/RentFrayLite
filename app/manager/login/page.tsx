import { Suspense } from "react";
import ManagerLoginClient from "./ManagerLoginClient";

export default function ManagerLoginPage() {
  return (
    <Suspense fallback={null}>
      <ManagerLoginClient />
    </Suspense>
  );
}