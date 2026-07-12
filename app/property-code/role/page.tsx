import { Suspense } from "react";
import RoleSelectClient from "./RoleSelectClient";

export default function RoleSelectPage() {
  return (
    <Suspense fallback={null}>
      <RoleSelectClient />
    </Suspense>
  );
}