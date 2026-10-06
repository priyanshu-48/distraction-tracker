import { lazy, Suspense } from 'react';
import {Routes,Route,Navigate} from "react-router-dom";
import Login from './features/auth/LoginPage';
import Register from './features/auth/RegisterPage';
import { ExtensionTokenSync } from './app/ExtensionTokenSync';
import ProtectedRoute from './components/ProtectedRoute';

// Design-system gallery for the new UI; only exists in development, never in a production build.
const DesignPage = import.meta.env.DEV ? lazy(() => import('./app/DesignPage')) : null;
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));

function App() {
  return(
    <>
    <ExtensionTokenSync />
    <Routes>
      {DesignPage && (
        <Route path="/design" element={<Suspense fallback={null}><DesignPage /></Suspense>} />
      )}
      <Route path="/" element={<ProtectedRoute><Suspense fallback={null}><DashboardPage /></Suspense></ProtectedRoute>} />
      {/* Old addresses still work: they open the matching panel on the one dashboard page. */}
      <Route path="/sites" element={<Navigate to="/?panel=sites" replace />} />
      <Route path="/setup" element={<Navigate to="/" replace />} />
      <Route path='/login' element={<Login />} />
      <Route path='/register' element={<Register />} />
      {/* The old dashboard pages are gone; old bookmarks land on the new one. */}
      <Route path="/dashboard/*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default App
