import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, Users, Pin, Reply, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface CommunityMessage {
  id: string;
  user_id: string;
  username: string;
  message: string;
  reply_to: string | null;
  created_at: string;
  is_pinned: boolean;
  room_id: string;
}

interface CommunityChatProps {
  onBack: () => void;
}

const CommunityChat = ({ onBack }: CommunityChatProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState('general');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const rooms = [
    { id: 'general', name: 'General', description: 'General discussion' },
    { id: 'support', name: 'Support', description: 'Technical support' },
    { id: 'products', name: 'Products', description: 'Product discussions' },
    { id: 'feedback', name: 'Feedback', description: 'Share your feedback' }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('community_messages')
        .select('*')
        .eq('room_id', selectedRoom)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || sending) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('community_messages')
        .insert({
          user_id: user.id,
          username: user.email?.split('@')[0] || 'Anonymous',
          message: newMessage.trim(),
          room_id: selectedRoom
        });

      if (error) throw error;

      setNewMessage('');
      toast({
        title: "Message sent!",
        description: "Your message has been posted to the community.",
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [selectedRoom]);

  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [messages, loading]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('community-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
          filter: `room_id=eq.${selectedRoom}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as CommunityMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoom]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Button 
              onClick={onBack}
              variant="outline" 
              size="lg"
              className="mr-6 bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Home
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Community Chat</h1>
              <p className="text-xl text-blue-200">Connect with other Snow Media users</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-blue-600/20 border border-blue-500/50 rounded-lg px-3 py-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-blue-400 text-sm">Community</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Room Selector */}
          <div className="lg:col-span-1">
            <Card className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-white">Chat Rooms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {rooms.map((room) => (
                  <Button
                    key={room.id}
                    onClick={() => setSelectedRoom(room.id)}
                    variant={selectedRoom === room.id ? "default" : "outline"}
                    className={`w-full justify-start ${
                      selectedRoom === room.id 
                        ? 'bg-blue-600 border-blue-500 text-white' 
                        : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                    }`}
                  >
                    <div className="text-left">
                      <div className="font-medium">{room.name}</div>
                      <div className="text-xs opacity-70">{room.description}</div>
                    </div>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-3">
            <Card className="bg-gradient-to-br from-blue-600/10 to-purple-600/10 border-blue-500/20 h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="text-white">
                  #{rooms.find(r => r.id === selectedRoom)?.name}
                </CardTitle>
              </CardHeader>
              
              {/* Messages */}
              <CardContent className="flex-1 overflow-y-auto space-y-4 p-4">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-white/60">Loading messages...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Users className="w-12 h-12 text-white/40 mx-auto mb-4" />
                      <div className="text-white/60">No messages yet</div>
                      <div className="text-white/40 text-sm">Be the first to start the conversation!</div>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="flex space-x-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                        {message.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-white">{message.username}</span>
                          <span className="text-xs text-white/60 flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                          </span>
                          {message.is_pinned && (
                            <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-400">
                              <Pin className="w-3 h-3 mr-1" />
                              Pinned
                            </Badge>
                          )}
                        </div>
                        <div className="text-white/90 bg-white/5 rounded-lg p-3">
                          {message.message}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </CardContent>

              {/* Message Input */}
              <div className="p-4 border-t border-white/10">
                {user ? (
                  <div className="flex space-x-2">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder={`Message #${rooms.find(r => r.id === selectedRoom)?.name}...`}
                      className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/60"
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      disabled={sending}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center text-white/60">
                    Please sign in to participate in the chat
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityChat;