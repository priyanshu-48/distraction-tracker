import { Navigate } from 'react-router-dom';
import { useSession } from '@/app/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';

/** Lets a signed-in user through. Whether anyone is signed in is a question for the server (see useSession). */
function ProtectedRoute({ children }) {
  const session = useSession();

  if (session.status === 'pending') {
    return (
      <div className="app-dark min-h-dvh p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="mx-auto h-16 max-w-6xl" />
      </div>
    );
  }
  if (session.status === 'error') {
    return (
      <div className="app-dark min-h-dvh p-6">
        <ErrorState title="Can't reach the server" onRetry={session.retry} />
      </div>
    );
  }
  if (session.status === 'signedOut') return <Navigate to="/login" replace />;

  return children;
}

export default ProtectedRoute;
