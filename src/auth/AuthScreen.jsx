import React, { useEffect, useState } from 'react';
import { Activity, ArrowRight, ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, Check, LoaderCircle } from 'lucide-react';
import { authConfigured, authError, authRedirect, enabledProviders, supabase } from './client';

function ProviderIcon({provider}) {
  return provider === 'google' ? <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.59 4.59 0 0 1-2 3.01v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.34Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"/></svg> : <svg width="20" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.1 12.5c0-2 1.6-3 1.7-3.1-1-1.5-2.6-1.7-3.2-1.7-1.4-.2-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8C7.8 7.7 6.4 8.6 5.7 10c-1.5 2.6-.4 6.5 1 8.6.7 1 1.5 2.1 2.6 2.1 1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.1-2.4-.1 0-2.7-1-2.7-3.8ZM14.7 6.3c.6-.8 1.1-1.9 1-3-.9.1-2 .6-2.7 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3Z"/></svg>;
}

export default function AuthScreen({recovery=false,onRecovered,initialError=''}) {
  const [mode,setMode]=useState(recovery?'update':'login');
  const [busy,setBusy]=useState('');
  const [visible,setVisible]=useState(false);
  const [error,setError]=useState(initialError);
  const [message,setMessage]=useState('');
  const [email,setEmail]=useState('');
  const [confirmationEmail,setConfirmationEmail]=useState('');
  const [cooldown,setCooldown]=useState(0);
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(n=>n-1),1000);return()=>clearTimeout(timer);},[cooldown]);
  useEffect(()=>{
    const params=new URLSearchParams(location.search);
    if(params.has('error')){
      setError(params.get('error')==='access_denied'?'Вход отменён или срок ссылки истёк. Попробуй ещё раз.':'Не удалось завершить вход. Попробуй ещё раз.');
      window.history.replaceState({},'',location.pathname);
    }
  },[]);
  const changeMode = next=>{setMode(next);setError('');setMessage('');setVisible(false);};
  async function submit(event) {
    event.preventDefault();setError('');setMessage('');
    if(!supabase){setError('Вход пока недоступен. Попробуй немного позже.');return;}
    const form=new FormData(event.currentTarget),password=String(form.get('password')||'');
    if(['register','update'].includes(mode) && password !== form.get('confirm')) {setError('Пароли не совпадают.');return;}
    if(['register','update'].includes(mode) && password.length<10) {setError('Используй пароль не короче 10 символов.');return;}
    if(mode==='register'&&!String(form.get('name')||'').trim()){setError('Укажи своё имя.');return;}
    setBusy('email');
    try {
      let result;
      if(mode==='login') result=await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(mode==='register') {
        result=await supabase.auth.signUp({email:email.trim(),password,options:{data:{display_name:String(form.get('name')).trim()},emailRedirectTo:authRedirect()}});
        if(!result.error&&!result.data.session){setConfirmationEmail(email.trim());setMode('confirm');setCooldown(60);}
      }
      if(mode==='reset') {
        result=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:authRedirect(true)});
        if(!result.error){setMessage('Если аккаунт с этим email существует, письмо со ссылкой для восстановления отправлено.');setCooldown(60);}
      }
      if(mode==='update') {
        result=await supabase.auth.updateUser({password});
        if(!result.error) onRecovered?.();
      }
      if(result?.error) setError(authError(result.error));
    } catch(err){setError(authError(err));} finally {setBusy('');}
  }
  async function oauth(provider) {
    setError('');setBusy(provider);
    if(!supabase){setError('Вход пока недоступен. Попробуй немного позже.');setBusy('');return;}
    try {
      const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:authRedirect()}});
      if(error)setError(authError(error));
    } catch(err){setError(authError(err));} finally {setBusy('');}
  }
  async function resend() {
    setBusy('resend');setError('');
    try{
      const {error}=await supabase.auth.resend({type:'signup',email:confirmationEmail,options:{emailRedirectTo:authRedirect()}});
      if(error)setError(authError(error));else{setMessage('Новое письмо отправлено. Проверь также папку «Спам».');setCooldown(60);}
    }catch(err){setError(authError(err));}finally{setBusy('');}
  }
  const titles={login:'С возвращением.',register:'Твой первый шаг.',reset:'Вернём тебя в ритм.',update:'Новый пароль.',confirm:'Проверь свою почту.'};
  const subtitles={login:'Войди, чтобы продолжить свой путь к цели.',register:'Создай аккаунт. Твоя история начинается с тебя.',reset:'Отправим ссылку для восстановления доступа.',update:'Выбери новый пароль для своего аккаунта.',confirm:`Отправили ссылку на ${confirmationEmail}. Подтверди email, чтобы войти.`};
  return <div className="auth-page"><section className="auth-story"><div className="auth-brand"><span className="brand-symbol"><Activity size={25}/></span>PULSE<span>.</span></div><div className="auth-story-content"><span className="hero-eyebrow"><span className="live-dot"/>ТВОЙ РИТМ. ТВОЙ ПРОГРЕСС.</span><h1>Большие перемены<br/>начинаются<br/><span>с первого шага.</span></h1><p>Планируй тренировки, отмечай победы<br/>и становись сильнее в своём темпе.</p><div className="auth-story-features"><span><Check size={15}/>Твой план</span><span><Check size={15}/>Твоя история</span><span><Check size={15}/>Твой прогресс</span></div></div><span className="auth-story-footer">SHOW UP. LEVEL UP.</span></section><main className="auth-main"><div className="auth-card"><div className="auth-mobile-brand"><Activity size={23}/>PULSE.</div><span className="eyebrow">ТВОЁ ЛИЧНОЕ ПРОСТРАНСТВО</span><h2>{titles[mode]}</h2><p className="auth-subtitle">{subtitles[mode]}</p>{!authConfigured&&<div className="auth-notice" role="status">Регистрация и вход скоро будут доступны. Попробуй зайти немного позже.</div>}{error&&<div className="auth-feedback error" role="alert">{error}</div>}{message&&<div className="auth-feedback success" role="status">{message}</div>}
    {['login','register'].includes(mode)&&<><div className="oauth-buttons">{['google','apple'].filter(p=>enabledProviders[p]).map(provider=><button className="oauth-button" key={provider} disabled={Boolean(busy)||!authConfigured} onClick={()=>oauth(provider)}>{busy===provider?<LoaderCircle className="spinning" size={20}/>:<ProviderIcon provider={provider}/>}<span>Продолжить с {provider==='google'?'Google':'Apple'}</span></button>)}</div><div className="auth-divider"><span>или по email</span></div></>}
    {mode!=='confirm'?<form key={mode} onSubmit={submit} className="auth-form"><fieldset disabled={Boolean(busy)}>{mode==='register'&&<label className="form-field">Как тебя зовут<input name="name" autoComplete="given-name" placeholder="Твоё имя" maxLength={24} required/></label>}{mode!=='update'&&<label className="form-field">Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/></label>}{mode!=='reset'&&<><label className="form-field"><span className="password-label">Пароль{mode==='login'&&<button type="button" onClick={()=>changeMode('reset')}>Забыл пароль?</button>}</span><div className="password-field"><input name="password" type={visible?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='login'?'Введи пароль':'Не менее 10 символов'} minLength={mode==='login'?1:10} maxLength={128} required/><button type="button" className="icon-button" aria-label={visible?'Скрыть пароль':'Показать пароль'} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>{mode!=='login'&&<label className="form-field">Повтори пароль<input name="confirm" type={visible?'text':'password'} autoComplete="new-password" placeholder="Ещё раз, чтобы не ошибиться" minLength={10} maxLength={128} required/></label>}</>}<button className="primary-button auth-submit" disabled={!authConfigured || (mode==='reset'&&cooldown>0)} type="submit">{busy?<LoaderCircle size={18} className="spinning"/>:null}{mode==='login'?'Войти':mode==='register'?'Создать аккаунт':mode==='update'?'Сохранить пароль':cooldown?`Повторить через ${cooldown} с`:'Отправить ссылку'}{!busy&&<ArrowRight size={18}/>}</button></fieldset></form>:<div className="confirmation-card"><div className="confirmation-icon"><Mail size={34}/></div><p>Открой письмо и перейди по ссылке. Если письма нет — проверь папку «Спам».</p><button className="secondary-button full-width" onClick={resend} disabled={Boolean(busy)||cooldown>0}>{cooldown?`Повторить через ${cooldown} с`:'Отправить письмо ещё раз'}</button></div>}
    {mode==='login'?<p className="auth-switch">Ещё нет аккаунта? <button disabled={Boolean(busy)} onClick={()=>changeMode('register')}>Зарегистрироваться<ArrowRight size={13}/></button></p>:mode==='register'?<p className="auth-switch">Уже с нами? <button disabled={Boolean(busy)} onClick={()=>changeMode('login')}>Войти</button></p>:mode!=='update'?<button className="auth-back" disabled={Boolean(busy)} onClick={()=>changeMode('login')}><ArrowLeft size={16}/>Вернуться ко входу</button>:null}<p className="auth-privacy"><LockKeyhole size={13}/>Твои тренировки доступны только тебе.</p></div><footer className="auth-footer">PULSE © {new Date().getFullYear()}<span>Каждый день — новая возможность.</span></footer></main></div>;
}
