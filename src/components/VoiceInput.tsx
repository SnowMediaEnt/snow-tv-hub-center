import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  className?: string;
}

export const VoiceInput = ({ onTranscription, className = '' }: VoiceInputProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      
      toast({
        title: "Recording started",
        description: "Speak now... Press again to stop.",
      });
    } catch (error) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice input.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      // Note: This would need a Supabase edge function for voice-to-text
      // For now, we'll simulate the transcription
      setTimeout(() => {
        setIsProcessing(false);
        toast({
          title: "Voice input not yet configured",
          description: "Voice-to-text feature needs backend setup.",
          variant: "destructive",
        });
      }, 1000);
      
    } catch (error) {
      setIsProcessing(false);
      toast({
        title: "Processing failed",
        description: "Could not process audio. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <Button
      onClick={toggleRecording}
      disabled={isProcessing}
      variant={isRecording ? "destructive" : "gold"}
      size="sm"
      className={`transition-all duration-200 ${className}`}
    >
      {isProcessing ? (
        <>
          <Volume2 className="w-4 h-4 mr-2 animate-pulse" />
          Processing...
        </>
      ) : isRecording ? (
        <>
          <MicOff className="w-4 h-4 mr-2 animate-pulse" />
          Stop Recording
        </>
      ) : (
        <>
          <Mic className="w-4 h-4 mr-2" />
          Voice Input
        </>
      )}
    </Button>
  );
};

export default VoiceInput;