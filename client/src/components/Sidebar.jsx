import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const links = [
    { name: "Dashboard", to: "/" },
    { name: "Analytics", to: "/dashboard/analytics" },
    { name: "Settings", to: "/settings" },
  ];

  return (
    <div className="relative">
      {/* Mobile toggle button */}
      <button
        className="md:hidden p-3 focus:outline-none text-stone-700"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <div
        className={`${
          isOpen ? "block" : "hidden"
        } md:block fixed md:static top-0 left-0 z-30 w-64 h-full bg-white shadow-md py-10 px-6 transition-transform`}
      >
        <nav className="space-y-2">
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.name}
                to={link.to}
                className={`block px-4 py-2 rounded-md transition-colors ${
                  isActive
                    ? "bg-violet-100 text-violet-600 font-medium"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
                onClick={() => setIsOpen(false)} // close sidebar on mobile
              >
                {link.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default Sidebar;


