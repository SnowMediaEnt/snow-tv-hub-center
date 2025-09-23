import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useWixIntegration } from './useWixIntegration';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { verifyWixMember, createMember, addToEmailList } = useWixIntegration();

  useEffect(() => {
    console.log('🔧 Auth hook: Setting up auth state listener...');
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔄 Auth state change:', event, session ? 'Session exists' : 'No session');
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Check for existing session
    console.log('🔍 Auth hook: Checking for existing session...');
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('📋 Existing session found:', session ? 'Yes' : 'No');
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      // First, verify if this email exists in Wix
      const wixVerification = await verifyWixMember(email);
      
      let wixMemberId = wixVerification.member?.id;
      
      // If Wix member doesn't exist, create one
      if (!wixVerification.exists) {
        console.log('Creating new Wix member account...');
        const nameParts = fullName?.split(' ') || [];
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        try {
          // Create member in Wix
          const newMember = await createMember({
            email,
            firstName,
            lastName,
            nickname: firstName
          });
          
          wixMemberId = newMember.member.id;
          
          // Add to email list
          await addToEmailList({
            email,
            firstName,
            lastName
          });
          
          console.log('Successfully created Wix member:', wixMemberId);
        } catch (wixError) {
          console.error('Error creating Wix member:', wixError);
          return { error: { message: 'Failed to create Wix account. Please contact support@snowmediaent.com.' } };
        }
      }

      // Proceed with Supabase signup
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName || wixVerification.member?.name || '',
            wix_member_id: wixMemberId
          }
        }
      });

      // Send custom welcome email
      if (!error) {
        await supabase.functions.invoke('send-custom-email', {
          body: {
            to: email,
            type: 'welcome',
            data: {
              name: fullName || wixVerification.member?.name || ''
            }
          }
        });
      }

      return { error };
    } catch (error) {
      console.error('Signup error:', error);
      return { error: { message: 'Failed to create account. Please try again.' } };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      console.log('🔐 Starting sign in process for:', email);
      
      // Verify Wix member exists before allowing login
      const wixVerification = await verifyWixMember(email);
      console.log('📋 Wix verification result:', wixVerification);
      
      if (!wixVerification.exists) {
        console.log('❌ No Wix member found for:', email);
        return { error: { message: 'Email not found in Snow Media Ent member database. Please sign up first or contact support.' } };
      }

      console.log('✅ Wix member verified, attempting Supabase login...');
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.log('❌ Supabase login failed:', error.message);
        // If Supabase login fails, try to create the account first
        if (error.message.includes('Invalid login credentials')) {
          console.log('🔧 Attempting to create Supabase account for existing Wix member...');
          const signUpResult = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/`,
              data: {
                full_name: wixVerification.member?.name || '',
                wix_member_id: wixVerification.member?.id
              }
            }
          });
          
          if (signUpResult.error) {
            console.log('❌ Account creation failed:', signUpResult.error.message);
            return { error: signUpResult.error };
          }
          
          console.log('✅ Account created, now signing in...');
          return { error: null };
        }
        return { error };
      }

      // Update profile with Wix account ID if login successful
      console.log('✅ Supabase login successful, updating profile...');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({
          wix_account_id: wixVerification.member?.id
        }).eq('user_id', user.id);
        console.log('✅ Profile updated with Wix account ID');
      }

      return { error };
    } catch (error) {
      console.error('💥 Login error:', error);
      return { error: { message: 'Failed to login. Please try again.' } };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut
  };
};