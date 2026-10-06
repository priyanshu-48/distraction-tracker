import './App.css'
import { lazy, Suspense } from 'react';
import {Routes,Route} from "react-router-dom";
import Dashboard from './layout/Dashboard';
import Analytics from "./pages/AnalyticsPage";
import HomePage from './pages/HomePage';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';
import RootRedirect from './pages/RootRedirect';

// Design-system gallery for the new UI; only exists in development, never in a production build.
const DesignPage = import.meta.env.DEV ? lazy(() => import('./app/DesignPage')) : null;

function App() {
  return(
    <Routes>
      {DesignPage && (
        <Route path="/design" element={<Suspense fallback={null}><DesignPage /></Suspense>} />
      )}
      <Route path="/" element={<RootRedirect />} />
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
