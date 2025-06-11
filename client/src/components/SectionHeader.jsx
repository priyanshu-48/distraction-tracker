import { Target } from "lucide-react";

export default function SectionHeader({ title }) {
  return (
    <div className="flex items-center gap-2 text-xl font-semibold text-gray-800">
      <Target className="text-red-500 w-5 h-5" />
      <h1>{title}</h1>
    </div>
  );
}