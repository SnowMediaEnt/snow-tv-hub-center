import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WixMember {
  id: string;
  loginEmail: string;
  profile: {
    nickname?: string;
    firstName?: string;
    lastName?: string;
  };
  contactId?: string;
}

interface TestEndpoint {
  name: string;
  status: number | string;
  success: boolean;
  response: string;
}

interface TestResults {
  endpoints: TestEndpoint[];
  connected: boolean;
  workingEndpoint: string | null;
  totalMembers: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== WIX INTEGRATION FUNCTION START ===');
    console.log('Wix integration function called');
    
    const wixApiKey = Deno.env.get('WIX_API_KEY');
    const wixAccountId = Deno.env.get('WIX_ACCOUNT_ID');
    const wixSiteId = Deno.env.get('WIX_SITE_ID');
    
    console.log('=== ENVIRONMENT VARIABLES ===');
    console.log('API Key present:', !!wixApiKey);
    console.log('Account ID present:', !!wixAccountId);
    console.log('Site ID present:', !!wixSiteId);
    console.log('API Key format:', wixApiKey ? `${wixApiKey.substring(0, 10)}...` : 'missing');
    console.log('Account ID:', wixAccountId);
    console.log('Site ID:', wixSiteId);
    console.log('=== END ENVIRONMENT VARIABLES ===');
    
    if (!wixApiKey || !wixAccountId) {
      console.error('Missing WIX_API_KEY or WIX_ACCOUNT_ID');
      return new Response(
        JSON.stringify({ 
          error: 'Wix API credentials not configured',
          details: {
            hasApiKey: !!wixApiKey,
            hasAccountId: !!wixAccountId,
            hasSiteId: !!wixSiteId
          }
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let payload: any = {};
    try {
      payload = await req.json();
    } catch (e) {
      console.warn('No/invalid JSON body, defaulting to empty payload');
      payload = {};
    }
    const { action, email, wixMemberId, items, memberData, subject, message: messageText, senderEmail, senderName } = payload;
    console.log('=== REQUEST DETAILS ===');
    console.log('Action requested:', action);
    console.log('Items for cart:', items ? JSON.stringify(items, null, 2) : 'No items');
    console.log('=== END REQUEST DETAILS ===');

    switch (action) {
      case 'get-products':
        if (!wixSiteId) {
          return new Response(
            JSON.stringify({ 
              error: 'Site ID required for products API',
              details: 'WIX_SITE_ID is required for site-level operations like fetching products.'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Get products using V1 API
        const productsResponse = await fetch('https://www.wixapis.com/stores/v1/products/query', {
          method: 'POST',
          headers: {
            'Authorization': wixApiKey,
            'wix-site-id': wixSiteId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: {
              paging: {
                limit: 50
              }
            }
          })
        });

        console.log('Products API response status:', productsResponse.status);
        if (!productsResponse.ok) {
          const errorText = await productsResponse.text();
          console.error('Products API error:', errorText);
          return new Response(
            JSON.stringify({ 
              error: `Wix Store API error: ${productsResponse.status} ${productsResponse.statusText}`,
              details: errorText,
              apiKey: wixApiKey ? `${wixApiKey.substring(0, 10)}...` : 'missing',
              accountId: wixAccountId
            }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }

        const productsData = await productsResponse.json();
        
        return new Response(
          JSON.stringify({ 
            products: productsData.products || [],
            total: productsData.totalResults || 0
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );

      case 'create-cart':
        if (!wixAccountId) {
          return new Response(
            JSON.stringify({ 
              error: 'Account ID required for cart creation',
              details: 'WIX_ACCOUNT_ID is required for eCommerce operations like cart creation.'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log('=== CREATE CART DEBUG ===');
        console.log('Items to add to cart:', JSON.stringify(items, null, 2));
        console.log('Account ID being used:', wixAccountId);
        
        if (!items || !Array.isArray(items) || items.length === 0) {
          console.error('Invalid or missing items for cart creation');
          return new Response(
            JSON.stringify({ error: 'Items array is required for cart creation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const cartResponse = await fetch(`https://www.wixapis.com/ecom/v1/carts`, {
          method: 'POST',
          headers: {
            'Authorization': wixApiKey,
            'wix-account-id': wixAccountId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lineItems: items.map((item: any) => ({
              catalogReference: {
                appId: "1380b703-ce81-ff05-f115-39571d94dfcd",
                catalogItemId: item.productId
              },
              quantity: item.quantity
            }))
          })
        });

        console.log('Cart API response status:', cartResponse.status);
        if (!cartResponse.ok) {
          const errorText = await cartResponse.text();
          console.error('Cart API error:', errorText);
          throw new Error(`Wix Cart API error: ${cartResponse.status} ${cartResponse.statusText} - ${errorText}`);
        }

        const cartData = await cartResponse.json();
        
        return new Response(
          JSON.stringify({ 
            cart: cartData.cart,
            checkoutUrl: cartData.cart?.checkoutUrl
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );

      case 'verify-member':
        console.log('Verifying member with email:', email);
        
        if (!wixSiteId) {
          return new Response(
            JSON.stringify({ 
              error: 'Site ID required for member verification',
              details: 'WIX_SITE_ID is required for member operations.'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const memberResponse = await fetch(`https://www.wixapis.com/members/v1/members/query`, {
          method: 'POST',
          headers: {
            'Authorization': wixApiKey,
            'wix-site-id': wixSiteId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filter: {
              loginEmail: { $eq: email }
            }
          })
        });

        console.log('Member verification response status:', memberResponse.status);

        if (memberResponse.status === 404) {
          return new Response(
            JSON.stringify({ 
              exists: false,
              member: null
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } else if (!memberResponse.ok) {
          const errorText = await memberResponse.text();
          console.error('Wix API error:', errorText);
          throw new Error(`Wix API error: ${memberResponse.status} ${memberResponse.statusText}`);
        }

        const memberData = await memberResponse.json();
        const member = memberData.members?.[0];

        return new Response(
          JSON.stringify({ 
            exists: !!member,
            member: member ? {
              id: member.id,
              email: member.loginEmail,
              name: member.profile?.firstName || member.profile?.nickname || 'Unknown'
            } : null
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );

      case 'test-connection':
        console.log('Testing Wix API connection...');
        
        const testResults: TestResults = {
          endpoints: [],
          connected: false,
          workingEndpoint: null,
          totalMembers: 0
        };
        
        // Test with site ID if available
        if (wixSiteId) {
          try {
            const testResponse = await fetch(`https://www.wixapis.com/members/v1/members/query`, {
              method: 'POST',
              headers: {
                'Authorization': wixApiKey,
                'wix-site-id': wixSiteId,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                query: { paging: { limit: 1 } }
              })
            });
            
            const testText = await testResponse.text();
            
            testResults.endpoints.push({
              name: 'wix-site-id header',
              status: testResponse.status,
              success: testResponse.ok,
              response: testText
            });
            
            if (testResponse.ok) {
              const data = JSON.parse(testText);
              testResults.connected = true;
              testResults.workingEndpoint = 'wix-site-id';
              testResults.totalMembers = data.totalCount || 0;
            }
          } catch (error) {
            console.error('Test error:', error);
            testResults.endpoints.push({
              name: 'wix-site-id header',
              status: 'error',
              success: false,
              response: error instanceof Error ? error.message : String(error)
            });
          }
        }
        
        return new Response(
          JSON.stringify({
            connected: testResults.connected,
            totalMembers: testResults.totalMembers,
            workingEndpoint: testResults.workingEndpoint,
            endpoints: testResults.endpoints,
            message: testResults.connected ? 'Successfully connected to Wix API!' : 'Unable to connect to Wix API'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
    }

  } catch (error) {
    console.error('Error in wix-integration function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});