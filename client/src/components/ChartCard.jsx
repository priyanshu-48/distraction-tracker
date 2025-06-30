export default function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-md py-6 ">
      <h2 className="text-xl font-semibold mb-4 text-center text-gray-800">
        {title}
      </h2>
      {children}
    </div>
  );
}
