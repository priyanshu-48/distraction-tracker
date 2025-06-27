import './App.css'
import {Routes,Route} from "react-router-dom";
import Dashboard from './layout/Dashboard';
import Analytics from './pages/analytics';
import HomePage from './pages/HomePage';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';


function App() {
  return(
    <Routes>
      <Route path='/login' element={<Login />} />
      <Route path='/register' element={<Register />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>
    </Routes>
  );
}

export default App
