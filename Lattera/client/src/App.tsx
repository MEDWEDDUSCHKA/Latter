<<<<<<< HEAD
import { useEffect, useState } from 'react';

import { AppProvider, useApp } from './contexts/AppContext';
import ToastContainer from './components/ui/Toast';

=======
import { useState } from 'react';
import { AppProvider } from './contexts/AppContext';
import ToastContainer from './components/ui/Toast';
>>>>>>> 96201ff60245a080daa5cad290a96bfc21f231c2
import SignUp from './pages/SignUp';
import VerifyEmail from './pages/VerifyEmail';
import Onboarding from './pages/Onboarding';
import MainChat from './pages/MainChat';
import Search from './pages/Search';
import Settings from './pages/Settings';

<<<<<<< HEAD
import type { Route, RouteData } from './routes';

const isProtectedRoute = (route: Route): boolean => {
  return route === '/' || route === '/search' || route === '/settings' || route === '/onboarding/profile';
};

function AppRouter() {
  const { authLoading, isAuthenticated, user } = useApp();

  const [currentRoute, setCurrentRoute] = useState<Route>('/auth/signup');
  const [routeData, setRouteData] = useState<RouteData>({});

  const navigate = (path: Route, data?: RouteData) => {
    setCurrentRoute(path);
    setRouteData(data || {});
  };

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      if (isProtectedRoute(currentRoute)) {
        setCurrentRoute('/auth/signup');
        setRouteData({});
      }
      return;
    }

    const needsOnboarding = Boolean(user && (!user.firstName || !user.lastName));

    if (needsOnboarding && currentRoute !== '/onboarding/profile') {
      setCurrentRoute('/onboarding/profile');
      setRouteData({});
      return;
    }

    if (
      currentRoute === '/auth/signup' ||
      currentRoute === '/auth/verify-email'
    ) {
      setCurrentRoute('/');
      setRouteData({});
    }
  }, [authLoading, currentRoute, isAuthenticated, user]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F9FBFF] via-white to-[#F0F9FF] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#2290FF]/20 border-t-[#2290FF] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {currentRoute === '/auth/signup' && <SignUp onNavigate={navigate} />}
      {currentRoute === '/auth/verify-email' && (
        <VerifyEmail
          email={routeData.email || ''}
          password={routeData.password}
          onNavigate={navigate}
        />
      )}
      {currentRoute === '/onboarding/profile' && (
        <Onboarding onNavigate={navigate} />
      )}
      {currentRoute === '/' && <MainChat onNavigate={navigate} />}
      {currentRoute === '/search' && <Search onNavigate={navigate} />}
      {currentRoute === '/settings' && <Settings onNavigate={navigate} />}
    </>
  );
}

function App() {
  return (
    <AppProvider>
      <ToastContainer />
      <AppRouter />
=======
type Route =
  | '/auth/signup'
  | '/auth/verify-email'
  | '/onboarding/profile'
  | '/'
  | '/search'
  | '/settings';

function App() {
  const [currentRoute, setCurrentRoute] = useState<Route>('/auth/signup');
  const [routeData, setRouteData] = useState<{ email?: string }>({});

  const navigate = (path: Route, data?: { email?: string }) => {
    setCurrentRoute(path);
    if (data) setRouteData(data);
  };

  return (
    <AppProvider>
      <ToastContainer />
      {currentRoute === '/auth/signup' && <SignUp onNavigate={navigate} />}
      {currentRoute === '/auth/verify-email' && (
        <VerifyEmail email={routeData.email || ''} onNavigate={navigate} />
      )}
      {currentRoute === '/onboarding/profile' && <Onboarding onNavigate={navigate} />}
      {currentRoute === '/' && <MainChat onNavigate={navigate} />}
      {currentRoute === '/search' && <Search onNavigate={navigate} />}
      {currentRoute === '/settings' && <Settings onNavigate={navigate} />}
>>>>>>> 96201ff60245a080daa5cad290a96bfc21f231c2
    </AppProvider>
  );
}

export default App;
