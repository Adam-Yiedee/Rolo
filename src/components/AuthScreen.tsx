import React from 'react';
import { User } from 'firebase/auth';

interface AuthScreenProps {
  onLogin: () => void;
  isLoggingIn: boolean;
}

export function AuthScreen({ onLogin, isLoggingIn }: AuthScreenProps) {
  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#4a453e] flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-[#f4f1e6] rounded-[32px] shadow-sm border border-[#e0dbc5] p-10 text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-serif italic text-[#5a5a40] tracking-tight">Roldex</h1>
          <p className="text-xs uppercase tracking-widest text-[#8e8a75] mt-1">Remember Who You Know</p>
        </div>
        
        <button
          onClick={onLogin}
          disabled={isLoggingIn}
          className="w-full h-12 bg-[#5a5a40] hover:bg-[#4a4a34] text-[#fbfaf5] rounded-full text-sm font-medium transition-transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-md"
        >
          {isLoggingIn ? 'Connecting...' : (
            <>
              <svg className="w-5 h-5 bg-white rounded-full p-[2px]" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                <path fill="none" d="M0 0h48v48H0z"></path>
              </svg>
              Sign in with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}
