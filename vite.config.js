import { defineConfig, loadEnv } from 'vite';
import { validateAuthConfig } from './src/auth/config.js';

export default defineConfig(({mode})=>{
  const auth=validateAuthConfig(loadEnv(mode,process.cwd(),'VITE_'));
  return {
    plugins:[{name:'validate-auth-settings',buildStart(){
      if(!auth.configured) this.warn('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before enabling real sign-in.');
    }}],
    test:{environment:'jsdom',include:['tests/**/*.test.{js,jsx}'],restoreMocks:true},
  };
});
