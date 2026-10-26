// Shown instantly while My matches loads (Next.js loading boundary).
import { ListSkeleton } from "@/components/ui/Skeletons";

export default function Loading() {
  return <ListSkeleton label="Loading your matches…" />;
}
