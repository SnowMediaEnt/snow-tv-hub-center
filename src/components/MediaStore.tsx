import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ExternalLink, Download, Smartphone, Tv, Monitor, Server, Globe, Headphones } from 'lucide-react';
import WixVerification from './WixVerification';

interface MediaStoreProps {
  onBack: () => void;
}

const MediaStore = ({ onBack }: MediaStoreProps) => {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const deviceCategories = {
    streaming: [
      {
        name: 'Android Phone',
        icon: Smartphone,
        description: 'Mobile streaming applications',
        apps: ['Cinema HD', 'Stremio', 'Kodi', 'VLC Media Player', 'MX Player']
      },
      {
        name: 'Android TV',
        icon: Tv,
        description: 'Smart TV streaming applications',
        apps: ['Netflix for Android TV', 'Prime Video TV', 'Plex for Android TV', 'Kodi TV']
      },
      {
        name: 'Fire TV Stick',
        icon: Tv,
        description: 'Amazon Fire TV applications',
        apps: ['Cinema HD for Fire TV', 'Stremio Fire TV', 'Tivimate Fire TV']
      }
    ],
    services: [
      {
        name: 'Dreamstreams',
        icon: Server,
        description: 'Premium IPTV streaming service',
        apps: ['Dreamstreams Setup', 'Player Configuration', 'Channel Lists'],
        pricing: '$20/month for 2 connections, $25/month for 6 connections'
      },
      {
        name: 'Plex Media Server',
        icon: Globe,
        description: 'Personal media streaming platform',
        apps: ['Plex Server Setup', 'Library Management', 'Remote Access'],
        pricing: '$8/month per setup'
      }
    ],
    hardware: [
      {
        name: 'Audio Equipment',
        icon: Headphones,
        description: 'Audio streaming and setup',
        apps: ['Bluetooth Setup', 'Audio Streaming Apps', 'Sound Configuration']
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
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
            <h1 className="text-4xl font-bold text-white mb-2">Snow Media Store</h1>
            <p className="text-xl text-blue-200">Premium Apps & Streaming Solutions</p>
          </div>
        </div>

        {/* Wix Integration Test */}
        <div className="mb-8">
          <WixVerification />
        </div>

        {/* Categories Tabs */}
        <Tabs defaultValue="streaming" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-800 border-slate-700 mb-8">
            <TabsTrigger value="streaming" className="text-white data-[state=active]:bg-blue-600">
              Streaming Devices
            </TabsTrigger>
            <TabsTrigger value="services" className="text-white data-[state=active]:bg-green-600">
              Premium Services
            </TabsTrigger>
            <TabsTrigger value="hardware" className="text-white data-[state=active]:bg-purple-600">
              Hardware & Setup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="streaming">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {deviceCategories.streaming.map((device, index) => {
                const Icon = device.icon;
                return (
                  <Card
                    key={index}
                    className="bg-gradient-to-br from-blue-800 to-blue-900 border-blue-700 p-6 cursor-pointer hover:scale-105 transition-transform duration-300"
                    onClick={() => setSelectedDevice(device.name)}
                  >
                    <div className="flex items-center mb-4">
                      <Icon className="w-12 h-12 text-blue-400 mr-4" />
                      <div>
                        <h3 className="text-xl font-bold text-white">{device.name}</h3>
                        <p className="text-blue-200">{device.description}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-blue-200 font-medium">Available Apps:</p>
                      <div className="flex flex-wrap gap-2">
                        {device.apps.slice(0, 3).map((app, appIndex) => (
                          <span
                            key={appIndex}
                            className="px-3 py-1 bg-blue-600/20 text-blue-300 rounded-full text-sm"
                          >
                            {app}
                          </span>
                        ))}
                        {device.apps.length > 3 && (
                          <span className="px-3 py-1 bg-slate-600/50 text-slate-300 rounded-full text-sm">
                            +{device.apps.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Button 
                      className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDevice(device.name);
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      View Apps
                    </Button>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="services">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {deviceCategories.services.map((service, index) => {
                const Icon = service.icon;
                return (
                  <Card
                    key={index}
                    className="bg-gradient-to-br from-green-800 to-green-900 border-green-700 p-6 cursor-pointer hover:scale-105 transition-transform duration-300"
                  >
                    <div className="flex items-center mb-4">
                      <Icon className="w-12 h-12 text-green-400 mr-4" />
                      <div>
                        <h3 className="text-xl font-bold text-white">{service.name}</h3>
                        <p className="text-green-200">{service.description}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-green-600/20 p-3 rounded-lg border border-green-500/30">
                        <p className="text-green-300 font-medium">Pricing:</p>
                        <p className="text-white">{service.pricing}</p>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-green-200 font-medium">Includes:</p>
                        <div className="flex flex-wrap gap-2">
                          {service.apps.map((app, appIndex) => (
                            <span
                              key={appIndex}
                              className="px-3 py-1 bg-green-600/20 text-green-300 rounded-full text-sm"
                            >
                              {app}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Contact for Setup
                    </Button>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="hardware">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {deviceCategories.hardware.map((hardware, index) => {
                const Icon = hardware.icon;
                return (
                  <Card
                    key={index}
                    className="bg-gradient-to-br from-purple-800 to-purple-900 border-purple-700 p-6 cursor-pointer hover:scale-105 transition-transform duration-300"
                  >
                    <div className="flex items-center mb-4">
                      <Icon className="w-12 h-12 text-purple-400 mr-4" />
                      <div>
                        <h3 className="text-xl font-bold text-white">{hardware.name}</h3>
                        <p className="text-purple-200">{hardware.description}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-purple-200 font-medium">Services:</p>
                      <div className="flex flex-wrap gap-2">
                        {hardware.apps.map((app, appIndex) => (
                          <span
                            key={appIndex}
                            className="px-3 py-1 bg-purple-600/20 text-purple-300 rounded-full text-sm"
                          >
                            {app}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <Button 
                      className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Get Support
                    </Button>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Selected Device Details */}
        {selectedDevice && (
          <div className="mt-8">
            <Card className="bg-gradient-to-br from-purple-600 to-purple-800 border-purple-500 p-6">
              <h2 className="text-2xl font-bold text-white mb-4">{selectedDevice} Applications</h2>
              <p className="text-purple-200 mb-6">
                Complete collection of optimized applications for {selectedDevice}. 
                Each app is tested and configured for optimal performance.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(deviceCategories)
                  .flat()
                  .find(d => d.name === selectedDevice)
                  ?.apps.map((app, index) => (
                    <Card key={index} className="bg-white/10 border-white/20 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{app}</span>
                        <Button 
                          size="sm" 
                          className="bg-purple-500 hover:bg-purple-600 text-white"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
              </div>
              
              <Button 
                onClick={() => setSelectedDevice(null)}
                variant="outline"
                className="mt-6 bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                Back to Categories
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaStore;