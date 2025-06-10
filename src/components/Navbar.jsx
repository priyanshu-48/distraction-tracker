import React from "react";
import settingsLogo from "../assets/settings.png";

const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-[#8B5CF6] border-b border-gray-200">
      <div className="text-xl font-medium text-[#FFFAF0]">
        Distraction Tracker
      </div>

      <div className="flex space-x-10">
        <a href="/dashboard" className="text-[#FFFAF0] hover:underline">
          Dashboard
        </a>
        <a href="/history" className="text-[#FFFAF0] hover:underline">
          History
        </a>
        <a href="/trends" className="text-[#FFFAF0] hover:underline">
          Trends
        </a>
      </div>

      <div className="flex space-x-8 items-center">
        <div className="hidden lg:flex justify-center space-x-12 items-center">
            <a href="#" className="py-2 px-3 border rounded-md text-[#fffaf0ff]">
                Sign In
            </a>
        </div>
        <div className="hidden lg:flex justify-center space-x-12 items-center border rounded-md border-[#fffaf0ff] bg-[#fffaf0ff]">
            <a href="#" className="py-2 px-3  text-[#8B5CF6]">
                Create Account
            </a>
        </div>
        <button><img className="w-6 h-6 hover:scale-125" src={settingsLogo} alt="settings"/></button>
      </div>
    </nav>
  );
};

export default Navbar;
