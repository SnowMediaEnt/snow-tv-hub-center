import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Layout, Image, Grid2X2, RectangleHorizontal } from 'lucide-react';
import MediaManager from '@/components/MediaManager';

interface SettingsProps {
  onBack: () => void;
  layoutMode: 'grid' | 'row';
  onLayoutChange: (mode: 'grid' | 'row') => void;
}

const Settings = ({ onBack, layoutMode, onLayoutChange }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState('layout');

  if (activeTab === 'media') {
    return <MediaManager onBack={() => setActiveTab('layout')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-8">
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
            <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
            <p className="text-xl text-blue-200">Customize your Snow Media Center experience</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-blue-800/50 border-blue-600">
            <TabsTrigger value="layout" className="data-[state=active]:bg-blue-600">
              <Layout className="w-4 h-4 mr-2" />
              Layout
            </TabsTrigger>
            <TabsTrigger value="media" className="data-[state=active]:bg-blue-600">
              <Image className="w-4 h-4 mr-2" />
              Media Manager
            </TabsTrigger>
          </TabsList>

          <TabsContent value="layout" className="mt-6">
            <Card className="bg-gradient-to-br from-blue-600 to-blue-800 border-blue-500 p-6">
              <h2 className="text-2xl font-bold text-white mb-6">Home Screen Layout</h2>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-white/10 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Grid2X2 className="w-8 h-8 text-blue-200" />
                    <div>
                      <Label className="text-lg font-semibold text-white">Grid Layout (2x2)</Label>
                      <p className="text-blue-200 text-sm">Traditional grid view with 4 main sections</p>
                    </div>
                  </div>
                  <Switch
                    checked={layoutMode === 'grid'}
                    onCheckedChange={(checked) => onLayoutChange(checked ? 'grid' : 'row')}
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-white/10 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <RectangleHorizontal className="w-8 h-8 text-blue-200" />
                    <div>
                      <Label className="text-lg font-semibold text-white">Row Layout</Label>
                      <p className="text-blue-200 text-sm">Single horizontal row - shows more background</p>
                    </div>
                  </div>
                  <Switch
                    checked={layoutMode === 'row'}
                    onCheckedChange={(checked) => onLayoutChange(checked ? 'row' : 'grid')}
                  />
                </div>
              </div>

              <div className="mt-8 p-4 bg-blue-900/50 rounded-lg">
                <h3 className="text-lg font-semibold text-white mb-2">Layout Preview</h3>
                <div className="bg-slate-800 p-4 rounded-lg">
                  {layoutMode === 'grid' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-600 h-8 rounded flex items-center justify-center text-xs">Apps</div>
                      <div className="bg-purple-600 h-8 rounded flex items-center justify-center text-xs">Store</div>
                      <div className="bg-green-600 h-8 rounded flex items-center justify-center text-xs">Videos</div>
                      <div className="bg-orange-600 h-8 rounded flex items-center justify-center text-xs">Chat</div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="bg-blue-600 h-8 w-16 rounded flex items-center justify-center text-xs">Apps</div>
                      <div className="bg-purple-600 h-8 w-16 rounded flex items-center justify-center text-xs">Store</div>
                      <div className="bg-green-600 h-8 w-16 rounded flex items-center justify-center text-xs">Videos</div>
                      <div className="bg-orange-600 h-8 w-16 rounded flex items-center justify-center text-xs">Chat</div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;