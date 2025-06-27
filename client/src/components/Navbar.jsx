import React from "react";
import settingsLogo from "../assets/settings.png";
import { useNavigate } from 'react-router-dom';

const Navbar = () => {

  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-violet border-b border-gray-200">
      <div className="text-xl font-medium text-white">
        Distraction Tracker
      </div>

      <div className="flex space-x-10">
        <a href="/dashboard" className="text-white hover:underline">
          Dashboard
        </a>
        <a href="/history" className="text-white hover:underline">
          History
        </a>
        <a href="/trends" className="text-white hover:underline">
          Trends
        </a>
      </div>

      <div className="flex space-x-8 items-center">
        <div className="hidden lg:flex justify-center space-x-12 items-center border rounded-md border-white bg-white">
          <button
            onClick={handleLogout}
            className="py-2 px-3 text-violet"
          >
            Log Out
          </button>
        </div>

        <button><img className="w-6 h-6 hover:scale-125" src={settingsLogo} alt="settings" /></button>
      </div>
    </nav>
  );
};

export default Navbar;
