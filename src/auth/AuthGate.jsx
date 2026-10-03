import React from 'react';
import App from '../App';
import AuthScreen from './AuthScreen';
import { useAuth } from './AuthProvider';
import { UserDataProvider } from '../state/UserDataProvider';
import { LoaderCircle } from 'lucide-react';

export default function AuthGate() {
  const {session,loading,recovery,finishRecovery,sessionError}=useAuth();
  if(loading) return <div className="account-loading" role="status"><LoaderCircle className="spinning" size={28}/><p>Возвращаемся в твой ритм…</p></div>;
  if(!session) return <AuthScreen initialError={sessionError}/>;
  if(recovery) return <AuthScreen key="recovery" recovery onRecovered={finishRecovery}/>;
  return <UserDataProvider key={session.user.id} user={session.user}><App/></UserDataProvider>;
}
