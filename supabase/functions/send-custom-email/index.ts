import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2563eb; margin: 0; font-size: 28px;">Welcome to Snow Media Center!</h1>
              </div>
              
              <div style="margin-bottom: 25px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0;">
                  Hello ${data.name || 'there'},
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 15px 0;">
                  Thank you for joining Snow Media Center! Your account has been successfully created and you're now part of our exclusive community.
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 15px 0;">
                  You can now access all your media content, manage your apps, and enjoy our premium features.
                </p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.loginUrl || '#'}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Get Started
                </a>
              </div>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 0;">
                  If you have any questions or need support, please contact us at 
                  <a href="mailto:support@snowmediaent.com" style="color: #2563eb; text-decoration: none;">support@snowmediaent.com</a>
                </p>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 10px 0 0 0;">
                  Best regards,<br>
                  The Snow Media Center Team
                </p>
              </div>
            </div>
          </div>
        `
      }
    case 'verification':
      return {
        subject: 'Verify Your Snow Media Center Account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color: #2563eb; text-align: center; margin-bottom: 30px;">Verify Your Account</h1>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hello ${data.name || 'there'},</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">Please verify your email address by clicking the button below:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.verificationUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Verify Account
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px;">
                If you didn't create an account, please ignore this email.
              </p>
              <p style="color: #6b7280; font-size: 14px;">
                Best regards,<br>The Snow Media Center Team
              </p>
            </div>
          </div>
        `
      }
    case 'password_reset':
      return {
        subject: 'Reset Your Snow Media Center Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color: #2563eb; text-align: center; margin-bottom: 30px;">Reset Your Password</h1>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hello ${data.name || 'there'},</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">You requested to reset your password. Click the button below to create a new password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.resetUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Reset Password
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px;">
                If you didn't request this, please ignore this email.
              </p>
              <p style="color: #6b7280; font-size: 14px;">
                Best regards,<br>The Snow Media Center Team
              </p>
            </div>
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Resend API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { to, type, data }: EmailData = await req.json();
    
    const template = getEmailTemplate(type, data);
    
    // Send email using Resend
    const result = await resend.emails.send({
      from: 'Snow Media Center <support@snowmediaent.com>',
      to: [to],
      subject: template.subject,
      html: template.html
    });

    console.log('Email sent successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        result: result
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