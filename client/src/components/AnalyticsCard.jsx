export default function AnalyticsCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border">
      {title && <h2 className="text-md font-semibold text-gray-700">{title}</h2>}
      {subtitle && <p className="text-sm text-gray-500 mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}