import { useState, useEffect } from 'react';
import { useWixIntegration } from './useWixIntegration';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

interface WixAuthUser {
  id: string;
  email: string;
  fullName?: string;
  isWixMember: boolean;
}

export const useWixAuth = () => {
  const [user, setUser] = useState<WixAuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { verifyWixMember, createMember } = useWixIntegration();

  useEffect(() => {
    // Check for existing session
    const checkSession = async () => {
      try {
        const savedUser = localStorage.getItem('wix-auth-user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const signInWithWix = async (email: string, password: string) => {
    setLoading(true);
    try {
      // First check if user exists in Wix
      const wixResult = await verifyWixMember(email);
      
      if (!wixResult.exists) {
        throw new Error('No account found with this email on Snow Media Ent. Please sign up first or contact support.');
      }

      // For now, we'll simulate the password check
      // In a real implementation, you'd validate the password against Wix
      // This would require Wix API extensions for password verification
      
      const wixUser: WixAuthUser = {
        id: wixResult.member?.id || email,
        email: email,
        fullName: wixResult.member?.name || '',
        isWixMember: true
      };

      setUser(wixUser);
      localStorage.setItem('wix-auth-user', JSON.stringify(wixUser));

      return { user: wixUser, error: null };
    } catch (error) {
      console.error('Wix sign in error:', error);
      return { 
        user: null, 
        error: error instanceof Error ? error : new Error('Sign in failed') 
      };
    } finally {
      setLoading(false);
    }
  };

  const signUpWithWix = async (email: string, password: string, fullName: string) => {
    setLoading(true);
    try {
      // First check if user already exists in Wix
      const existingResult = await verifyWixMember(email);
      
      if (existingResult.exists) {
        throw new Error('An account with this email already exists. Please sign in instead.');
      }

      // Create new Wix member
      const createResult = await createMember({
        email: email,
        firstName: fullName.split(' ')[0] || '',
        lastName: fullName.split(' ').slice(1).join(' ') || '',
        nickname: fullName
      });

      const wixUser: WixAuthUser = {
        id: createResult.member.id,
        email: email,
        fullName: fullName,
        isWixMember: true
      };

      setUser(wixUser);
      localStorage.setItem('wix-auth-user', JSON.stringify(wixUser));

      return { user: wixUser, error: null };
    } catch (error) {
      console.error('Wix sign up error:', error);
      return { 
        user: null, 
        error: error instanceof Error ? error : new Error('Sign up failed') 
      };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setUser(null);
    localStorage.removeItem('wix-auth-user');
    return { error: null };
  };

  const handleQRLogin = async (token: string, wixMemberData: any) => {
    try {
      // Verify the QR token exists in our database
      const { data: session, error: sessionError } = await supabase
        .from('qr_login_sessions')
        .select('*')
        .eq('token', token)
        .eq('is_used', false)
        .single();

      if (sessionError || !session) {
        throw new Error('Invalid or expired QR code');
      }

      // Check if token is expired
      if (new Date(session.expires_at) < new Date()) {
        throw new Error('QR code has expired');
      }

      // Mark token as used
      await supabase
        .from('qr_login_sessions')
        .update({ 
          is_used: true,
          user_id: wixMemberData.id 
        })
        .eq('token', token);

      // Create user session
      const wixUser: WixAuthUser = {
        id: wixMemberData.id,
        email: wixMemberData.loginEmail || wixMemberData.email,
        fullName: wixMemberData.name || wixMemberData.nickname || '',
        isWixMember: true
      };

      setUser(wixUser);
      localStorage.setItem('wix-auth-user', JSON.stringify(wixUser));

      return { user: wixUser, error: null };
    } catch (error) {
      console.error('QR login error:', error);
      return { 
        user: null, 
        error: error instanceof Error ? error : new Error('QR login failed') 
      };
    }
  };

  return {
    user,
    loading,
    signInWithWix,
    signUpWithWix,
    signOut,
    handleQRLogin
  };
};