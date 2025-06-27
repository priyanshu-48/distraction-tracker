import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function RootRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  }, [navigate]);

  return null; 
}

export default RootRedirect;
