import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './client';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({children}) {
  const [session,setSession] = useState(null);
  const [loading,setLoading] = useState(Boolean(supabase));
  const [recovery,setRecovery] = useState(new URLSearchParams(location.search).get('auth') === 'recovery');
  const [sessionError,setSessionError] = useState('');
  useEffect(()=>{
    if (!supabase) return;
    let alive = true;
    // Keep the auth callback synchronous: database calls run in the data provider.
    const {data:{subscription}} = supabase.auth.onAuthStateChange((event,next)=>{
      if(!alive) return;
      setSession(next);
      if(event === 'PASSWORD_RECOVERY') setRecovery(true);
      if(event === 'SIGNED_OUT') setRecovery(false);
    });
    supabase.auth.getSession().then(({data,error})=>{
      if(!alive) return;
      setSession(data?.session ?? null);
      if(error) setSessionError('Не удалось восстановить вход. Войди ещё раз.');
      setLoading(false);
    }).catch(()=>{if(alive){setSessionError('Не удалось подключиться. Обнови страницу и попробуй снова.');setLoading(false);}});
    return ()=>{alive=false;subscription.unsubscribe();};
  },[]);
  const finishRecovery = ()=>{
    setRecovery(false);
    window.history.replaceState({},'',`${location.pathname}#dashboard`);
  };
  return <AuthContext.Provider value={{session,loading,recovery,finishRecovery,sessionError}}>{children}</AuthContext.Provider>;
}
