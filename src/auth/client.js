import { createClient } from '@supabase/supabase-js';
import { validateAuthConfig } from './config';

const config = validateAuthConfig(import.meta.env);
export const authConfigured = config.configured;
export const enabledProviders = {
  google: import.meta.env.VITE_AUTH_GOOGLE_ENABLED !== 'false',
  apple: import.meta.env.VITE_AUTH_APPLE_ENABLED !== 'false',
};
export const supabase = authConfigured ? createClient(config.url, config.key, {
  auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
}) : null;

export function authRedirect(recovery = false) {
  return `${window.location.origin}/${recovery ? '?auth=recovery' : ''}`;
}

export function authError(error) {
  const messages = {
    invalid_credentials:'Неверный email или пароль.',
    email_not_confirmed:'Подтверди email по ссылке из письма, затем войди.',
    weak_password:'Этот пароль слишком простой. Выбери другой, не короче 10 символов.',
    over_email_send_rate_limit:'Слишком много писем. Подожди немного и попробуй снова.',
    over_request_rate_limit:'Слишком много попыток. Попробуй через несколько минут.',
    user_already_exists:'Не удалось создать аккаунт. Попробуй войти или восстановить пароль.',
    email_exists:'Не удалось создать аккаунт. Попробуй войти или восстановить пароль.',
    signup_disabled:'Регистрация временно недоступна. Попробуй позже.',
    provider_disabled:'Этот способ входа пока недоступен. Войди по email.',
    validation_failed:'Проверь правильность email и пароля.',
    same_password:'Новый пароль должен отличаться от прежнего.',
    otp_expired:'Срок действия ссылки истёк. Запроси новое письмо.',
  };
  return messages[error?.code] || 'Не удалось выполнить запрос. Проверь подключение и попробуй ещё раз.';
}
