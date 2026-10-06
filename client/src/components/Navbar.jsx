import React from "react";
import settingsLogo from "../assets/settings.png";
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { logout } from '../app/auth';

const Navbar = () => {

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Also tells the extension, so it stops recording as this account.
  const handleLogout = async () => {
    await logout(queryClient);
    navigate('/login');
  };

  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-violet border-b border-gray-200">
      <div className="text-xl font-medium text-white">
        Distraction Tracker
      </div>

      <div className="flex space-x-8 items-center">
        <div className="flex max-lg:hidden justify-center space-x-12 items-center border rounded-md border-white bg-white">
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
