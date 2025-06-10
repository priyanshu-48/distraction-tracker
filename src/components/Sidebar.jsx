import { useState } from "react";
import { Menu, X } from "lucide-react";

function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    { name: "Dashboard", href: "#" },
    { name: "Analytics", href: "#" },
    { name: "Settings", href: "#" },
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
            <a
              key={link.name}
              href={link.href}
              className="block hover:bg-dark-grey rounded px-2 py-1"
            >
              {link.name}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default Sidebar;
