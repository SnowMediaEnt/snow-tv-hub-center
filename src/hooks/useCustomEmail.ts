import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface EmailData {
  to: string;
  type: 'welcome' | 'verification' | 'password_reset';
  data: {
    name?: string;
    verificationUrl?: string;
    resetUrl?: string;
  };
}

export const useCustomEmail = () => {
  const [loading, setLoading] = useState(false);

  const sendEmail = async (emailData: EmailData) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-custom-email', {
        body: emailData
      });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    sendEmail
  };
};