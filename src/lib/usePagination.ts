import { useMemo, useState, useEffect } from "react";

// Simple client-side pagination for admin lists that already fetch their
// full dataset in one request (bookings, pousadas, candidaturas, turismo).
// Slicing here — rather than adding server-side offset/limit params — is
// the right tradeoff while these tables hold dozens to a few hundred rows;
// it keeps the table responsive without a backend change, and can be
// swapped for real server-side pagination later if a table grows enough to
// make full-fetch impractical.
export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Snap back to a valid page whenever the filtered/underlying list shrinks
  // (e.g. a search narrows the results) so the view never sits on a blank
  // "page 5 of 2".
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, setPage, totalPages, pageItems, totalItems: items.length, pageSize };
}
