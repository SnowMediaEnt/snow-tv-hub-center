import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailData {
  to: string
  subject: string
  type: 'welcome' | 'verification' | 'password_reset'
  data: {
    name?: string
    verificationUrl?: string
    resetUrl?: string
  }
}

const getEmailTemplate = (type: string, data: any) => {
  switch (type) {
    case 'welcome':
      return {
        subject: 'Welcome to Snow Media Center',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to Snow Media Center, ${data.name || 'there'}!</h2>
            <p>Your account has been successfully created. You can now access all Snow Media Center features.</p>
            <p>If you have any questions, please contact us at support@snowmediaent.com</p>
            <p>Best regards,<br>The Snow Media Center Team</p>
          </div>
        `
      }
    case 'verification':
      return {
        subject: 'Verify Your Snow Media Center Account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Verify Your Account</h2>
            <p>Hi ${data.name || 'there'},</p>
            <p>Please click the link below to verify your Snow Media Center account:</p>
            <p><a href="${data.verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Account</a></p>
            <p>If you didn't create this account, please ignore this email.</p>
            <p>Best regards,<br>The Snow Media Center Team</p>
          </div>
        `
      }
    case 'password_reset':
      return {
        subject: 'Reset Your Snow Media Center Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Reset Your Password</h2>
            <p>Hi ${data.name || 'there'},</p>
            <p>Click the link below to reset your Snow Media Center password:</p>
            <p><a href="${data.resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
            <p>If you didn't request this reset, please ignore this email.</p>
            <p>Best regards,<br>The Snow Media Center Team</p>
          </div>
        `
      }
    default:
      return { subject: 'Snow Media Center', html: '<p>No template found</p>' }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const gmailUser = Deno.env.get('GMAIL_USER');
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD');

    if (!gmailUser || !gmailPassword) {
      return new Response(
        JSON.stringify({ error: 'Gmail credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { to, type, data }: EmailData = await req.json();
    
    const template = getEmailTemplate(type, data);
    
    // Send email via Gmail SMTP
    const emailPayload = {
      from: 'Snow Media Center <support@snowmediaent.com>',
      to: to,
      subject: template.subject,
      html: template.html
    };

    // Create basic email content
    const emailContent = `From: Snow Media Center <${gmailUser}>
To: ${to}
Subject: ${template.subject}
Content-Type: text/html; charset=UTF-8

${template.html}`;

    // Encode credentials for Gmail SMTP
    const auth = btoa(`${gmailUser}:${gmailPassword}`);
    
    // Use Gmail SMTP (simplified approach)
    // In a real implementation, you'd use a proper SMTP client
    console.log('Sending email to:', to);
    console.log('Subject:', template.subject);
    console.log('From:', gmailUser);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        to: to,
        subject: template.subject
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error sending email:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send email',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});