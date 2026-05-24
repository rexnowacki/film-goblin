import Link from "next/link";
import BulkAddFilmsClient from "./BulkAddFilmsClient";

export default function BulkAddFilmsPage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/films" className="btn btn-sm btn-outline" style={{ textDecoration: "none" }}>
          Back to films
        </Link>
      </div>
      <h1 className="h-display" style={{ marginBottom: 18 }}>Bulk add films</h1>
      <BulkAddFilmsClient />
    </div>
  );
}
