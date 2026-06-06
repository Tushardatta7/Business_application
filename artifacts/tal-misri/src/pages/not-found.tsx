import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <p className="text-6xl font-bold text-muted mb-4">৪০৪</p>
      <h1 className="text-xl font-semibold text-foreground mb-2">পৃষ্ঠা পাওয়া যায়নি</h1>
      <p className="text-muted-foreground text-sm mb-6">আপনি যে পৃষ্ঠাটি খুঁজছেন তা বিদ্যমান নেই।</p>
      <Link href="/" className="bg-primary text-primary-foreground px-6 py-3 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
        হোমে ফিরুন
      </Link>
    </div>
  );
}
