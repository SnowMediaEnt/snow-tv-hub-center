import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Wallet, CreditCard, History, User, LogOut, Plus, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';

interface UserDashboardProps {
  onViewChange: (view: 'home' | 'apps' | 'media' | 'news' | 'support' | 'chat' | 'settings' | 'user' | 'store' | 'community' | 'credits') => void;
  onManageMedia: () => void;
  onViewSettings: () => void;
  onCommunityChat: () => void;
  onCreditStore: () => void;
}

const UserDashboard = ({ onViewChange, onManageMedia, onViewSettings, onCommunityChat, onCreditStore }: UserDashboardProps) => {
  const { user, signOut } = useAuth();
  const { profile, transactions, loading } = useUserProfile();
  const { toast } = useToast();
  const [showPurchase, setShowPurchase] = useState(false);

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
      onViewChange('home');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-xl text-blue-200">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Button 
              onClick={() => onViewChange('home')}
              variant="outline" 
              size="lg"
              className="mr-6 bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Home
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Your Dashboard</h1>
              <p className="text-xl text-blue-200">Welcome back, {profile?.full_name || user?.email}</p>
            </div>
          </div>
          <Button 
            onClick={handleSignOut}
            variant="outline" 
            className="bg-red-600 border-red-500 text-white hover:bg-red-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-green-600 to-green-800 border-green-500 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Available Credits</p>
                <p className="text-3xl font-bold text-white">{profile?.credits?.toFixed(2) || '0.00'}</p>
              </div>
              <Wallet className="w-12 h-12 text-green-200" />
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-blue-600 to-blue-800 border-blue-500 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Total Spent</p>
                <p className="text-3xl font-bold text-white">${profile?.total_spent?.toFixed(2) || '0.00'}</p>
              </div>
              <CreditCard className="w-12 h-12 text-blue-200" />
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-purple-600 to-purple-800 border-purple-500 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Transactions</p>
                <p className="text-3xl font-bold text-white">{transactions.length}</p>
              </div>
              <History className="w-12 h-12 text-purple-200" />
            </div>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8">
          <Button 
            onClick={onCreditStore}
            size="lg"
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Plus className="w-5 h-5 mr-2" />
            Purchase Credits
          </Button>
          <Button 
            onClick={onCommunityChat}
            size="lg"
            variant="outline"
            className="bg-blue-600/20 border-blue-500/50 text-white hover:bg-blue-600/30"
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            Community Chat
          </Button>
        </div>

        {/* Recent Transactions */}
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 p-6">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
            <History className="w-6 h-6 mr-2" />
            Recent Transactions
          </h2>
          
          {transactions.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div 
                  key={transaction.id}
                  className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-600"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      transaction.transaction_type === 'purchase' ? 'bg-green-400' :
                      transaction.transaction_type === 'deduction' ? 'bg-red-400' :
                      'bg-blue-400'
                    }`} />
                    <div>
                      <p className="text-white font-medium">{transaction.description}</p>
                      <p className="text-slate-400 text-sm">
                        {new Date(transaction.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${
                      transaction.transaction_type === 'purchase' ? 'text-green-400' :
                      transaction.transaction_type === 'deduction' ? 'text-red-400' :
                      'text-blue-400'
                    }`}>
                      {transaction.transaction_type === 'deduction' ? '-' : '+'}
                      {transaction.amount.toFixed(2)} credits
                    </p>
                    <Badge 
                      variant="secondary" 
                      className={`${
                        transaction.transaction_type === 'purchase' ? 'bg-green-600' :
                        transaction.transaction_type === 'deduction' ? 'bg-red-600' :
                        'bg-blue-600'
                      } text-white`}
                    >
                      {transaction.transaction_type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default UserDashboard;