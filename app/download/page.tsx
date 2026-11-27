import { redirect } from "next/navigation";
/** Preserve legacy bookmarks; the landing page owns the single manual install flow. */
export default function DownloadPage() { redirect("/"); }
