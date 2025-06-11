import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";

function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    { name: "Dashboard", to: "/" },
    { name: "Analytics", to: "/analytics" },
    { name: "Settings", to: "/settings" }, // changed from "#" to real route
  ];

  return (
    <div className="md:flex">
      <div
        className={`${
          isOpen ? "block" : "hidden"
        } md:block w-64 bg-grey text-navy-blue h-screen p-6`}
      >
        <nav className="space-y-4">
          {links.map((link) => (
            <Link
              key={link.name}
              to={link.to}
              className="block hover:bg-dark-grey rounded px-2 py-1"
            >
              {link.name}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default Sidebar;

