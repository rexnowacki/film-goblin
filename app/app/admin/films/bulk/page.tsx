import Link from "next/link";
import BulkAddFilmsClient from "./BulkAddFilmsClient";

export default function BulkAddFilmsPage() {
  return (
    <div className="admin-form-page">
      <div className="admin-back-link">
        <Link href="/admin/films" className="btn btn-sm btn-outline" style={{ textDecoration: "none" }}>
          Back to films
        </Link>
      </div>
      <header className="admin-page-head"><div><div className="eyebrow">Mass summoning</div><h1>Bulk add films</h1><p>Open the gate for several catalog records at once.</p></div></header>
      <div className="admin-form-surface"><BulkAddFilmsClient /></div>
    </div>
  );
}
