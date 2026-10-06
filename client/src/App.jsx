import './App.css'
import { lazy, Suspense } from 'react';
import {Routes,Route} from "react-router-dom";
import Dashboard from './layout/Dashboard';
import Analytics from "./pages/AnalyticsPage";
import HomePage from './pages/HomePage';
import Login from './features/auth/LoginPage';
import Register from './features/auth/RegisterPage';
import { ExtensionTokenSync } from './app/ExtensionTokenSync';
import ProtectedRoute from './components/ProtectedRoute';
import RootRedirect from './pages/RootRedirect';

// Design-system gallery for the new UI; only exists in development, never in a production build.
const DesignPage = import.meta.env.DEV ? lazy(() => import('./app/DesignPage')) : null;
const SitesPage = lazy(() => import('./features/sites/SitesPage'));
const SetupPage = lazy(() => import('./features/setup/SetupPage'));

function App() {
  return(
    <>
    <ExtensionTokenSync />
    <Routes>
      {DesignPage && (
        <Route path="/design" element={<Suspense fallback={null}><DesignPage /></Suspense>} />
      )}
      <Route path="/sites" element={<ProtectedRoute><Suspense fallback={null}><SitesPage /></Suspense></ProtectedRoute>} />
      <Route path="/setup" element={<ProtectedRoute><Suspense fallback={null}><SetupPage /></Suspense></ProtectedRoute>} />
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
    </>
  );
}

export default App
