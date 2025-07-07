import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useWixIntegration } from '@/hooks/useWixIntegration';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const WixVerification = () => {
  const [email, setEmail] = useState('');
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const { verifyWixMember, loading } = useWixIntegration();
  const { toast } = useToast();

  const handleVerify = async () => {
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter an email to verify",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await verifyWixMember(email);
      setVerificationResult(result);
      
      toast({
        title: result.exists ? "Wix member found!" : "No Wix member found",
        description: result.exists 
          ? `Found member: ${result.member?.name}` 
          : "This email is not associated with a Wix account",
        variant: result.exists ? "default" : "destructive",
      });
    } catch (error) {
      console.error('Verification error:', error);
      toast({
        title: "Verification failed",
        description: "Could not verify Wix integration. Check the function logs.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="bg-gradient-to-br from-purple-600 to-purple-800 border-purple-500 p-6 max-w-md mx-auto">
      <h3 className="text-2xl font-bold text-white mb-4">Test Wix Integration</h3>
      
      <div className="space-y-4">
        <Input
          type="email"
          placeholder="Enter email to verify"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-white/10 border-white/20 text-white placeholder:text-white/60"
        />
        
        <Button 
          onClick={handleVerify} 
          disabled={loading}
          className="w-full bg-white text-purple-800 hover:bg-white/90"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify Wix Member'
          )}
        </Button>

        {verificationResult && (
          <div className="mt-4 p-4 bg-white/10 rounded-lg border border-white/20">
            <div className="flex items-center mb-2">
              {verificationResult.exists ? (
                <CheckCircle className="w-5 h-5 text-green-400 mr-2" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 mr-2" />
              )}
              <span className="text-white font-medium">
                {verificationResult.exists ? 'Member Found' : 'No Member Found'}
              </span>
            </div>
            
            {verificationResult.member && (
              <div className="text-white/80 text-sm">
                <p><strong>Name:</strong> {verificationResult.member.name}</p>
                <p><strong>Email:</strong> {verificationResult.member.email}</p>
                <p><strong>ID:</strong> {verificationResult.member.id}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default WixVerification;