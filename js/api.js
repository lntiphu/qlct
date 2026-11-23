import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
export function getClient() {
  return window.__QLCT_SUPABASE_CLIENT ||= window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true},realtime:{timeout:5000}});
}
export async function requireSession(){
 const client=getClient(); if(!client) throw new Error('Không tải được Supabase. Hãy kiểm tra kết nối.');
 const {data,error}=await client.auth.getSession(); if(error) throw error;
 if(!data.session){location.replace(new URL('../index.html',import.meta.url));return null;}
 const id=data.session.user.id;
 client.auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_OUT'||(s&&s.user.id!==id)) location.replace(new URL('../index.html',import.meta.url));});
 return id;
}
